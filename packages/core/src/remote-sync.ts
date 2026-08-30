import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LearningStore } from "./storage.js";
import type { RemoteSyncConfig, SyncSnapshot, SyncStatus } from "./types.js";

const DEFAULT_REMOTE_URL = "https://language-coach.pluginsfoundry.dev";

export function resolveRemoteSyncConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.LANGUAGE_COACH_SYNC_CONFIG_PATH || join(homedir(), ".language-coach", "remote-sync.json");
}

function readConfig(path: string): RemoteSyncConfig | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<RemoteSyncConfig>;
    if (!value.remoteUrl || !value.token || !value.userId) return undefined;
    return { remoteUrl: value.remoteUrl, token: value.token, userId: value.userId };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export class RemoteLearningSync {
  private readonly configPath: string;
  private activeSync?: Promise<SyncSnapshot>;
  private lastSyncedAt?: string;
  private lastError?: string;

  constructor(private readonly store: LearningStore, env: NodeJS.ProcessEnv = process.env) {
    this.configPath = resolveRemoteSyncConfigPath(env);
  }

  get remoteUrl(): string {
    return readConfig(this.configPath)?.remoteUrl || process.env.LANGUAGE_COACH_REMOTE_URL || DEFAULT_REMOTE_URL;
  }

  get config(): RemoteSyncConfig | undefined {
    return readConfig(this.configPath);
  }

  get status(): SyncStatus {
    const config = this.config;
    return {
      enabled: Boolean(config),
      userId: config?.userId,
      remoteUrl: config?.remoteUrl || this.remoteUrl,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
    };
  }

  configure(config: RemoteSyncConfig): void {
    const existing = this.config;
    if (existing?.userId && existing.userId !== config.userId) {
      throw new Error("This local database is already linked to another account. Disable sync before linking a different account.");
    }
    if (!config.remoteUrl.startsWith("https://") || config.token.length < 32 || !config.userId) {
      throw new Error("The remote sync configuration is invalid.");
    }
    mkdirSync(dirname(this.configPath), { recursive: true, mode: 0o700 });
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  disable(): void {
    rmSync(this.configPath, { force: true });
    this.lastSyncedAt = undefined;
    this.lastError = undefined;
  }

  sync(): Promise<SyncSnapshot> {
    this.activeSync ??= this.performSync().finally(() => { this.activeSync = undefined; });
    return this.activeSync;
  }

  private async performSync(): Promise<SyncSnapshot> {
    const config = this.config;
    if (!config) throw new Error("Login and sync are not enabled.");
    try {
      const response = await fetch(`${config.remoteUrl.replace(/\/$/, "")}/api/sync`, {
        method: "POST",
        headers: { authorization: `Sync ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify(this.store.getSyncSnapshot()),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Remote sync failed (${response.status}): ${body.slice(0, 240)}`);
      }
      const snapshot = await response.json() as SyncSnapshot;
      this.store.mergeSyncSnapshot(snapshot);
      this.lastSyncedAt = new Date().toISOString();
      this.lastError = undefined;
      return snapshot;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}
