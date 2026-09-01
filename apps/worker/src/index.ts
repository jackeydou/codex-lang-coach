import { createRemoteJWKSet, jwtVerify } from "jose";
import { Client } from "pg";
import { calculateProgress } from "@language-coach/core/progress";
import type {
  DashboardData,
  InputLanguageKind,
  LanguageProfile,
  LearningNote,
  SyncSnapshot,
} from "@language-coach/core/types";

interface Env {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  NEON_AUTH_URL: string;
}

type AuthenticatedUser = { id: string; source: "jwt" | "sync" };
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
};

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
    const result = await client.query<{ user_id: string | null }>("SELECT public.resolve_sync_token($1) AS user_id", [await sha256(token)]);
    const userId = result.rows[0]?.user_id;
    if (!userId) throw new Error("The sync token is invalid or revoked.");
    return { id: userId, source: "sync" };
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

async function readNotes(client: Client, userId: string, limit = 500): Promise<LearningNote[]> {
  const result = await client.query<NoteRow>(
    "SELECT * FROM public.learning_notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, Math.max(1, Math.min(500, Math.trunc(limit)))],
  );
  return result.rows.map(mapNote);
}

async function readSnapshot(client: Client, userId: string): Promise<SyncSnapshot> {
  const [profile, notes, deleted] = await Promise.all([
    readProfile(client, userId),
    readNotes(client, userId),
    client.query<{ id: string; deleted_at: Date | string }>(
      "SELECT id, deleted_at FROM public.deleted_learning_notes WHERE user_id = $1 ORDER BY deleted_at",
      [userId],
    ),
  ]);
  return {
    profile,
    notes,
    deletedNotes: deleted.rows.map((item) => ({ id: item.id, deletedAt: iso(item.deleted_at) })),
  };
}

async function mergeSnapshot(client: Client, userId: string, snapshot: SyncSnapshot): Promise<void> {
  const current = await readProfile(client, userId);
  if (snapshot.profile.updatedAt > current.updatedAt) {
    await client.query(`UPDATE public.language_profiles
      SET native_language = $2, target_language = $3, coach_enabled = $4, updated_at = $5
      WHERE user_id = $1`, [userId, snapshot.profile.nativeLanguage, snapshot.profile.targetLanguage,
      snapshot.profile.coachEnabled, snapshot.profile.updatedAt]);
  }

  for (const deleted of snapshot.deletedNotes) {
    await client.query(`INSERT INTO public.deleted_learning_notes (user_id, id, deleted_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, id) DO UPDATE SET deleted_at = GREATEST(deleted_learning_notes.deleted_at, excluded.deleted_at)`,
    [userId, deleted.id, deleted.deletedAt]);
    await client.query("DELETE FROM public.learning_notes WHERE user_id = $1 AND id = $2", [userId, deleted.id]);
  }

  for (const note of snapshot.notes) {
    await client.query(`INSERT INTO public.learning_notes (
      user_id, id, turn_id, input_language, original_expression, polished_expression, corrections,
      patterns, examples, native_language, target_language, created_at
    ) SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12
      WHERE NOT EXISTS (SELECT 1 FROM public.deleted_learning_notes WHERE user_id = $1 AND id = $2)
      ON CONFLICT DO NOTHING`, [userId, note.id, note.turnId ?? null, note.inputLanguage,
      note.originalExpression, note.polishedExpression, JSON.stringify(note.corrections),
      JSON.stringify(note.patterns), JSON.stringify(note.examples), note.nativeLanguage,
      note.targetLanguage, note.createdAt]);
  }
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
    const token = createSyncToken();
    await withTenant(env, user.id, async (client) => {
      await client.query("INSERT INTO public.sync_tokens (token_hash, user_id) VALUES ($1, $2)", [await sha256(token), user.id]);
    });
    return json(request, { token, userId: user.id });
  }

  if (url.pathname === "/api/sync-tokens" && request.method === "DELETE") {
    if (user.source !== "jwt") return json(request, { error: "Interactive login is required." }, 403);
    await withTenant(env, user.id, async (client) => {
      await client.query("DELETE FROM public.sync_tokens WHERE user_id = $1", [user.id]);
    });
    return json(request, { revoked: true });
  }

  return withTenant(env, user.id, async (client) => {
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      const [profile, notes] = await Promise.all([readProfile(client, user.id), readNotes(client, user.id)]);
      const data: DashboardData = { profile, notes: notes.slice(0, 100), progress: calculateProgress(notes), sync: { enabled: true, userId: user.id, remoteUrl: url.origin } };
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
      const result = await client.query("DELETE FROM public.learning_notes WHERE user_id = $1 AND id = $2", [user.id, id]);
      if (result.rowCount) {
        await client.query(`INSERT INTO public.deleted_learning_notes (user_id, id, deleted_at) VALUES ($1, $2, now())
          ON CONFLICT (user_id, id) DO UPDATE SET deleted_at = excluded.deleted_at`, [user.id, id]);
      }
      return json(request, { deleted: Boolean(result.rowCount) }, result.rowCount ? 200 : 404);
    }

    if (url.pathname === "/api/sync" && request.method === "POST") {
      const snapshot = await request.json<SyncSnapshot>();
      if (!snapshot.profile || !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.deletedNotes)) {
        return json(request, { error: "Invalid sync snapshot." }, 400);
      }
      await mergeSnapshot(client, user.id, snapshot);
      return json(request, await readSnapshot(client, user.id));
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
