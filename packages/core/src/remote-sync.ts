import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LearningStore } from "./storage.js";
import type { RemoteSyncConfig, SyncStatus, SyncUploadBatch, SyncUploadResult } from "./types.js";

const DEFAULT_REMOTE_URL = "https://language-coach.pluginsfoundry.dev";
const SYNC_BATCH_SIZE = 100;

export function resolveRemoteSyncConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.LANGUAGE_COACH_SYNC_CONFIG_PATH || join(homedir(), ".language-coach", "remote-sync.json");
}

function readConfig(path: string): RemoteSyncConfig | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<RemoteSyncConfig>;
    if (!value.remoteUrl || !value.token || !value.userId) return undefined;
    const deviceId = value.deviceId || randomUUID();
    const config = {
      remoteUrl: value.remoteUrl,
      token: value.token,
      userId: value.userId,
      deviceId,
      deviceName: value.deviceName || `Device ${deviceId.slice(0, 8)}`,
    };
    if (!value.deviceId || !value.deviceName) {
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    }
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export class RemoteLearningSync {
  private readonly configPath: string;
  private activeSync?: Promise<SyncUploadResult>;
  private syncRequested = false;
  private lastSyncedAt?: string;
  private lastError?: string;
  private state: SyncStatus["state"] = "idle";
  private completedItems = 0;
  private totalItems = 0;

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
      deviceId: config?.deviceId,
      deviceName: config?.deviceName,
      remoteUrl: config?.remoteUrl || this.remoteUrl,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
      state: this.state,
      completedItems: this.completedItems,
      totalItems: this.totalItems,
    };
  }

  configure(config: RemoteSyncConfig): void {
    const existing = this.config;
    if (existing?.userId && existing.userId !== config.userId) {
      throw new Error("This local database is already linked to another account. Disable sync before linking a different account.");
    }
    if (!config.remoteUrl.startsWith("https://") || config.token.length < 32 || !config.userId || !config.deviceId) {
      throw new Error("The remote sync configuration is invalid.");
    }
    mkdirSync(dirname(this.configPath), { recursive: true, mode: 0o700 });
    writeFileSync(this.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  disable(): void {
    rmSync(this.configPath, { force: true });
    this.lastSyncedAt = undefined;
    this.lastError = undefined;
    this.state = "idle";
    this.completedItems = 0;
    this.totalItems = 0;
  }

  sync(): Promise<SyncUploadResult> {
    this.syncRequested = true;
    this.activeSync ??= this.drainSyncQueue().finally(() => { this.activeSync = undefined; });
    return this.activeSync;
  }

  private async drainSyncQueue(): Promise<SyncUploadResult> {
    let combined: SyncUploadResult | undefined;
    do {
      this.syncRequested = false;
      const result = await this.performSync();
      combined = {
        deviceId: result.deviceId,
        acceptedNotes: (combined?.acceptedNotes ?? 0) + result.acceptedNotes,
        acceptedDeletions: (combined?.acceptedDeletions ?? 0) + result.acceptedDeletions,
        syncedAt: result.syncedAt,
      };
    } while (this.syncRequested);
    return combined!;
  }

  private async uploadBatch(config: RemoteSyncConfig, batch: SyncUploadBatch): Promise<SyncUploadResult> {
    const response = await fetch(`${config.remoteUrl.replace(/\/$/, "")}/api/sync`, {
      method: "POST",
      headers: { authorization: `Sync ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Remote sync failed (${response.status}): ${body.slice(0, 240)}`);
    }
    return response.json() as Promise<SyncUploadResult>;
  }

  private async performSync(): Promise<SyncUploadResult> {
    const config = this.config;
    if (!config) throw new Error("Login and sync are not enabled.");
    const snapshot = this.store.getSyncSnapshot();
    const batches: Array<Pick<SyncUploadBatch, "notes" | "deletedNotes">> = [];
    for (let offset = 0; offset < snapshot.deletedNotes.length; offset += SYNC_BATCH_SIZE) {
      batches.push({ notes: [], deletedNotes: snapshot.deletedNotes.slice(offset, offset + SYNC_BATCH_SIZE) });
    }
    for (let offset = 0; offset < snapshot.notes.length; offset += SYNC_BATCH_SIZE) {
      batches.push({ notes: snapshot.notes.slice(offset, offset + SYNC_BATCH_SIZE), deletedNotes: [] });
    }
    if (!batches.length) batches.push({ notes: [], deletedNotes: [] });

    this.state = "syncing";
    this.completedItems = 0;
    this.totalItems = snapshot.notes.length + snapshot.deletedNotes.length;
    let acceptedNotes = 0;
    let acceptedDeletions = 0;
    let syncedAt = new Date().toISOString();
    try {
      for (const [index, contents] of batches.entries()) {
        const result = await this.uploadBatch(config, {
          deviceId: config.deviceId,
          deviceName: config.deviceName,
          profile: index === 0 ? snapshot.profile : undefined,
          ...contents,
        });
        acceptedNotes += result.acceptedNotes;
        acceptedDeletions += result.acceptedDeletions;
        syncedAt = result.syncedAt;
        this.completedItems += contents.notes.length + contents.deletedNotes.length;
      }
      this.lastSyncedAt = syncedAt;
      this.lastError = undefined;
      this.state = "idle";
      return { deviceId: config.deviceId, acceptedNotes, acceptedDeletions, syncedAt };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.state = "error";
      throw error;
    }
  }
}
