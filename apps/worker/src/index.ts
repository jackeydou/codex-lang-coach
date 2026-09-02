import { createRemoteJWKSet, jwtVerify } from "jose";
import { Client } from "pg";
import type {
  DashboardData,
  InputLanguageKind,
  LanguageProfile,
  LearningNote,
  NotesPage,
  ProgressSummary,
  SyncUploadBatch,
  SyncUploadResult,
} from "@language-coach/core/types";

interface Env {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  NEON_AUTH_URL: string;
}

type AuthenticatedUser = { id: string; source: "jwt" | "sync"; deviceId?: string; tokenHash?: string };
type ProfileRow = { native_language: string; target_language: string; coach_enabled: boolean; updated_at: Date | string };
type NoteRow = {
  id: string;
  turn_id: string | null;
  input_language: InputLanguageKind;
  original_expression: string;
  polished_expression: string;
  corrections: LearningNote["corrections"];
  patterns: LearningNote["patterns"];
  examples: LearningNote["examples"];
  native_language: string;
  target_language: string;
  created_at: Date | string;
  device_id: string | null;
  device_name: string | null;
};

type NoteCursor = { createdAt: string; id: string };

let jwksUrl = "";
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export function neonAuthTokenVerification(authUrl: string): { jwksUrl: string; issuer: string } {
  const normalizedAuthUrl = authUrl.replace(/\/$/, "");
  return {
    jwksUrl: `${normalizedAuthUrl}/.well-known/jwks.json`,
    issuer: new URL(normalizedAuthUrl).origin,
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function corsOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  const url = new URL(origin);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname.endsWith(".workers.dev")) return origin;
  return undefined;
}

function json(request: Request, value: unknown, status = 200, headers?: HeadersInit): Response {
  const origin = corsOrigin(request);
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
      ...headers,
    },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createSyncToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `lc_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSyncUploadBatch(value: unknown): value is SyncUploadBatch {
  if (!value || typeof value !== "object") return false;
  const batch = value as Partial<SyncUploadBatch>;
  if (!isUuid(batch.deviceId) || (batch.deviceName !== undefined && typeof batch.deviceName !== "string")
    || !Array.isArray(batch.notes) || !Array.isArray(batch.deletedNotes)
    || batch.notes.length + batch.deletedNotes.length > 100) return false;
  if (batch.profile && (typeof batch.profile.nativeLanguage !== "string"
    || typeof batch.profile.targetLanguage !== "string" || typeof batch.profile.coachEnabled !== "boolean"
    || !isDate(batch.profile.updatedAt))) return false;
  if (!batch.deletedNotes.every((item) => isUuid(item?.id) && isDate(item?.deletedAt))) return false;
  return batch.notes.every((note) => isUuid(note?.id)
    && ["native", "target", "mixed", "other"].includes(note.inputLanguage)
    && typeof note.originalExpression === "string" && typeof note.polishedExpression === "string"
    && Array.isArray(note.corrections) && Array.isArray(note.patterns) && Array.isArray(note.examples)
    && typeof note.nativeLanguage === "string" && typeof note.targetLanguage === "string"
    && isDate(note.createdAt));
}

async function connect(env: Env): Promise<Client> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  return client;
}

async function withTenant<T>(env: Env, userId: string, operation: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(env);
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [userId]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyJwt(token: string, env: Env): Promise<AuthenticatedUser> {
  const verification = neonAuthTokenVerification(env.NEON_AUTH_URL);
  const nextJwksUrl = verification.jwksUrl;
  if (!jwks || jwksUrl !== nextJwksUrl) {
    jwksUrl = nextJwksUrl;
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: verification.issuer,
    audience: verification.issuer,
  });
  if (!payload.sub) throw new Error("The authentication token has no user ID.");
  if (payload.emailVerified !== true && payload.email_verified !== true) throw new Error("Email verification is required.");
  return { id: payload.sub, source: "jwt" };
}

async function resolveSyncToken(token: string, env: Env): Promise<AuthenticatedUser> {
  const client = await connect(env);
  try {
    const tokenHash = await sha256(token);
    const result = await client.query<{ user_id: string | null; device_id: string | null }>(
      "SELECT * FROM public.resolve_sync_token_identity($1)",
      [tokenHash],
    );
    const userId = result.rows[0]?.user_id;
    if (!userId) throw new Error("The sync token is invalid or revoked.");
    return { id: userId, source: "sync", deviceId: result.rows[0]?.device_id ?? undefined, tokenHash };
  } finally {
    await client.end();
  }
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return verifyJwt(authorization.slice(7), env);
  if (authorization.startsWith("Sync ")) return resolveSyncToken(authorization.slice(5), env);
  throw new Error("Authentication required.");
}

function mapProfile(row: ProfileRow): LanguageProfile {
  return {
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    coachEnabled: row.coach_enabled,
    updatedAt: iso(row.updated_at),
  };
}

function mapNote(row: NoteRow): LearningNote {
  return {
    id: row.id,
    turnId: row.turn_id ?? undefined,
    inputLanguage: row.input_language,
    originalExpression: row.original_expression,
    polishedExpression: row.polished_expression,
    corrections: row.corrections,
    patterns: row.patterns,
    examples: row.examples,
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    createdAt: iso(row.created_at),
    source: row.device_id ? { deviceId: row.device_id, deviceName: row.device_name ?? undefined } : undefined,
  };
}

async function ensureProfile(client: Client, userId: string): Promise<void> {
  await client.query("INSERT INTO public.language_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
}

async function readProfile(client: Client, userId: string): Promise<LanguageProfile> {
  await ensureProfile(client, userId);
  const result = await client.query<ProfileRow>("SELECT * FROM public.language_profiles WHERE user_id = $1", [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("Language profile not found.");
  return mapProfile(row);
}

function encodeCursor(note: LearningNote): string {
  return btoa(JSON.stringify({ createdAt: note.createdAt, id: note.id } satisfies NoteCursor))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(value: string | null): NoteCursor | undefined {
  if (!value) return undefined;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized)) as Partial<NoteCursor>;
    if (!parsed.createdAt || !parsed.id || Number.isNaN(Date.parse(parsed.createdAt))) return undefined;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return undefined;
  }
}

async function readNotesPage(client: Client, userId: string, url: URL): Promise<{ notes: LearningNote[]; page: NotesPage }> {
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 50));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const result = await client.query<NoteRow>(`SELECT notes.*, devices.display_name AS device_name
    FROM public.learning_notes AS notes
    LEFT JOIN public.sync_devices AS devices
      ON devices.user_id = notes.user_id AND devices.device_id = notes.device_id
    WHERE notes.user_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )
      AND ($2::timestamptz IS NULL OR (notes.created_at, notes.id) < ($2::timestamptz, $3::uuid))
    ORDER BY notes.created_at DESC, notes.id DESC
    LIMIT $4`, [userId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1]);
  const hasMore = result.rows.length > limit;
  const notes = result.rows.slice(0, limit).map(mapNote);
  return {
    notes,
    page: { limit, hasMore, nextCursor: hasMore && notes.length ? encodeCursor(notes[notes.length - 1]!) : undefined },
  };
}

async function readProgress(client: Client, userId: string): Promise<ProgressSummary> {
  const [summaryResult, weeklyResult, streakResult, categoryResult, patternResult] = await Promise.all([
    client.query<{
      total_notes: number; active_days: number; notes_this_week: number;
      native_count: number; target_count: number; mixed_count: number; other_count: number;
    }>(`SELECT
      count(*)::int AS total_notes,
      count(DISTINCT timezone('UTC', created_at)::date)::int AS active_days,
      count(*) FILTER (WHERE timezone('UTC', created_at)::date >= timezone('UTC', now())::date - 6)::int AS notes_this_week,
      count(*) FILTER (WHERE input_language = 'native')::int AS native_count,
      count(*) FILTER (WHERE input_language = 'target')::int AS target_count,
      count(*) FILTER (WHERE input_language = 'mixed')::int AS mixed_count,
      count(*) FILTER (WHERE input_language = 'other')::int AS other_count
      FROM public.learning_notes AS notes
      WHERE user_id = $1 AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )`, [userId]),
    client.query<{ date: string; count: number }>(`WITH days AS (
      SELECT generate_series(timezone('UTC', now())::date - 6, timezone('UTC', now())::date, interval '1 day')::date AS day
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date, count(notes.id)::int AS count
    FROM days LEFT JOIN public.learning_notes AS notes
      ON notes.user_id = $1 AND timezone('UTC', notes.created_at)::date = days.day
      AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )
    GROUP BY days.day ORDER BY days.day`, [userId]),
    client.query<{ current_streak: number }>(`WITH active_days AS (
      SELECT DISTINCT timezone('UTC', created_at)::date AS day
      FROM public.learning_notes AS notes
      WHERE user_id = $1 AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )
    ), ranked AS (
      SELECT day, row_number() OVER (ORDER BY day DESC) AS position FROM active_days
    )
    SELECT count(*)::int AS current_streak FROM ranked
    WHERE day = timezone('UTC', now())::date - (position::int - 1)`, [userId]),
    client.query<{ category: ProgressSummary["categoryCounts"][number]["category"]; count: number }>(`SELECT correction->>'category' AS category, count(*)::int AS count
      FROM public.learning_notes AS notes, jsonb_array_elements(notes.corrections) AS correction
      WHERE notes.user_id = $1 AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )
      GROUP BY correction->>'category' ORDER BY count DESC`, [userId]),
    client.query<{ pattern: string; explanation: string; count: number }>(`SELECT
      min(pattern->>'pattern') AS pattern,
      min(pattern->>'explanation') AS explanation,
      count(*)::int AS count
      FROM public.learning_notes AS notes, jsonb_array_elements(notes.patterns) AS pattern
      WHERE notes.user_id = $1 AND btrim(pattern->>'pattern') <> '' AND NOT EXISTS (
        SELECT 1 FROM public.deleted_learning_notes AS deleted
        WHERE deleted.user_id = notes.user_id AND deleted.id = notes.id
      )
      GROUP BY lower(btrim(pattern->>'pattern')) ORDER BY count DESC LIMIT 8`, [userId]),
  ]);
  const summary = summaryResult.rows[0] ?? {
    total_notes: 0, active_days: 0, notes_this_week: 0,
    native_count: 0, target_count: 0, mixed_count: 0, other_count: 0,
  };
  const languageTotal = summary.native_count + summary.target_count;
  return {
    totalNotes: summary.total_notes,
    notesThisWeek: summary.notes_this_week,
    activeDays: summary.active_days,
    currentStreak: streakResult.rows[0]?.current_streak ?? 0,
    weeklyActivity: weeklyResult.rows,
    categoryCounts: categoryResult.rows,
    recurringPatterns: patternResult.rows,
    languageUse: {
      native: summary.native_count,
      target: summary.target_count,
      mixed: summary.mixed_count,
      other: summary.other_count,
      targetShare: languageTotal ? Math.round((summary.target_count / languageTotal) * 100) : 0,
    },
  };
}

async function uploadBatch(client: Client, userId: string, batch: SyncUploadBatch): Promise<SyncUploadResult> {
  const deviceName = batch.deviceName?.trim().slice(0, 120) || `Device ${batch.deviceId.slice(0, 8)}`;
  await client.query(`INSERT INTO public.sync_devices (user_id, device_id, display_name, last_synced_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (user_id, device_id) DO UPDATE
      SET display_name = excluded.display_name, last_synced_at = excluded.last_synced_at`,
  [userId, batch.deviceId, deviceName]);

  if (batch.profile) {
    await client.query(`INSERT INTO public.language_profiles (
      user_id, native_language, target_language, coach_enabled, updated_at
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) DO UPDATE SET
      native_language = excluded.native_language,
      target_language = excluded.target_language,
      coach_enabled = excluded.coach_enabled,
      updated_at = excluded.updated_at
    WHERE language_profiles.updated_at < excluded.updated_at`,
    [userId, batch.profile.nativeLanguage, batch.profile.targetLanguage, batch.profile.coachEnabled, batch.profile.updatedAt]);
  }

  for (const deleted of batch.deletedNotes) {
    await client.query(`INSERT INTO public.deleted_learning_notes (user_id, id, deleted_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, id) DO UPDATE SET deleted_at = GREATEST(deleted_learning_notes.deleted_at, excluded.deleted_at)`,
    [userId, deleted.id, deleted.deletedAt]);
    await client.query("DELETE FROM public.learning_notes WHERE user_id = $1 AND id = $2", [userId, deleted.id]);
  }

  let acceptedNotes = 0;
  for (const note of batch.notes) {
    const result = await client.query(`INSERT INTO public.learning_notes (
      user_id, id, turn_id, input_language, original_expression, polished_expression, corrections,
      patterns, examples, native_language, target_language, created_at, device_id
    ) SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13
      WHERE NOT EXISTS (SELECT 1 FROM public.deleted_learning_notes WHERE user_id = $1 AND id = $2)
      ON CONFLICT (user_id, id) DO NOTHING`, [userId, note.id, note.turnId ?? null, note.inputLanguage,
      note.originalExpression, note.polishedExpression, JSON.stringify(note.corrections),
      JSON.stringify(note.patterns), JSON.stringify(note.examples), note.nativeLanguage,
      note.targetLanguage, note.createdAt, batch.deviceId]);
    acceptedNotes += result.rowCount ?? 0;
  }
  return {
    deviceId: batch.deviceId,
    acceptedNotes,
    acceptedDeletions: batch.deletedNotes.length,
    syncedAt: new Date().toISOString(),
  };
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    const origin = corsOrigin(request);
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-max-age": "86400",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
      },
    });
  }
  if (url.pathname === "/api/config" && request.method === "GET") {
    return json(request, { mode: "remote", remoteUrl: url.origin, authUrl: env.NEON_AUTH_URL });
  }

  let user: AuthenticatedUser;
  try {
    user = await authenticate(request, env);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Authentication required." }, 401);
  }

  if (url.pathname === "/api/sync-tokens" && request.method === "POST") {
    if (user.source !== "jwt") return json(request, { error: "Interactive login is required." }, 403);
    const input = await request.json<{ deviceId?: string; deviceName?: string }>();
    if (!isUuid(input.deviceId)) return json(request, { error: "A valid device ID is required." }, 400);
    const deviceName = input.deviceName?.trim().slice(0, 120) || `Device ${input.deviceId.slice(0, 8)}`;
    const token = createSyncToken();
    await withTenant(env, user.id, async (client) => {
      await client.query(`INSERT INTO public.sync_devices (user_id, device_id, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, device_id) DO UPDATE SET display_name = excluded.display_name`,
      [user.id, input.deviceId, deviceName]);
      await client.query("DELETE FROM public.sync_tokens WHERE user_id = $1 AND device_id = $2", [user.id, input.deviceId]);
      await client.query("INSERT INTO public.sync_tokens (token_hash, user_id, device_id) VALUES ($1, $2, $3)",
        [await sha256(token), user.id, input.deviceId]);
    });
    return json(request, { token, userId: user.id, deviceId: input.deviceId, deviceName });
  }

  if (url.pathname.startsWith("/api/sync-tokens/") && request.method === "DELETE") {
    if (user.source !== "jwt") return json(request, { error: "Interactive login is required." }, 403);
    const deviceId = decodeURIComponent(url.pathname.slice("/api/sync-tokens/".length));
    if (!isUuid(deviceId)) return json(request, { error: "A valid device ID is required." }, 400);
    await withTenant(env, user.id, async (client) => {
      await client.query("DELETE FROM public.sync_tokens WHERE user_id = $1 AND device_id = $2", [user.id, deviceId]);
    });
    return json(request, { revoked: true, deviceId });
  }

  if (user.source === "sync" && !(url.pathname === "/api/sync" && request.method === "POST")) {
    return json(request, { error: "Device sync tokens can only upload data." }, 403);
  }

  return withTenant(env, user.id, async (client) => {
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      const [profile, notesResult, progress] = await Promise.all([
        readProfile(client, user.id),
        readNotesPage(client, user.id, url),
        readProgress(client, user.id),
      ]);
      const data: DashboardData = {
        profile,
        notes: notesResult.notes,
        notesPage: notesResult.page,
        progress,
        sync: { enabled: true, userId: user.id, remoteUrl: url.origin },
      };
      return json(request, data);
    }

    if (url.pathname === "/api/profile" && request.method === "PUT") {
      const input = await request.json<Partial<LanguageProfile>>();
      const current = await readProfile(client, user.id);
      const profile: LanguageProfile = {
        nativeLanguage: input.nativeLanguage?.trim() || current.nativeLanguage,
        targetLanguage: input.targetLanguage?.trim() || current.targetLanguage,
        coachEnabled: input.coachEnabled ?? current.coachEnabled,
        updatedAt: new Date().toISOString(),
      };
      await client.query(`UPDATE public.language_profiles SET native_language = $2, target_language = $3,
        coach_enabled = $4, updated_at = $5 WHERE user_id = $1`, [user.id, profile.nativeLanguage,
        profile.targetLanguage, profile.coachEnabled, profile.updatedAt]);
      return json(request, profile);
    }

    if (url.pathname.startsWith("/api/notes/") && request.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.slice("/api/notes/".length));
      if (!isUuid(id)) return json(request, { error: "A valid note ID is required." }, 400);
      const result = await client.query("DELETE FROM public.learning_notes WHERE user_id = $1 AND id = $2", [user.id, id]);
      if (result.rowCount) {
        await client.query(`INSERT INTO public.deleted_learning_notes (user_id, id, deleted_at) VALUES ($1, $2, now())
          ON CONFLICT (user_id, id) DO UPDATE SET deleted_at = excluded.deleted_at`, [user.id, id]);
      }
      return json(request, { deleted: Boolean(result.rowCount) }, result.rowCount ? 200 : 404);
    }

    if (url.pathname === "/api/sync" && request.method === "POST") {
      if (user.source !== "sync") return json(request, { error: "A device sync token is required." }, 403);
      const batch = await request.json<unknown>();
      if (!isSyncUploadBatch(batch)) {
        return json(request, { error: "Invalid sync upload batch." }, 400);
      }
      if (user.deviceId && user.deviceId !== batch.deviceId) {
        return json(request, { error: "This sync token belongs to a different device." }, 403);
      }
      if (!user.deviceId && user.tokenHash) {
        await client.query("UPDATE public.sync_tokens SET device_id = $2 WHERE token_hash = $1 AND user_id = $3",
          [user.tokenHash, batch.deviceId, user.id]);
      }
      return json(request, await uploadBatch(client, user.id, batch));
    }
    return json(request, { error: "Not found." }, 404);
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json(request, { error: "Unexpected server error." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
