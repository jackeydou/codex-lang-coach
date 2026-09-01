import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteLearningSync } from "../src/remote-sync.js";
import { SqliteLearningStore } from "../src/storage.js";
import type { SyncUploadBatch } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("RemoteLearningSync", () => {
  it("uploads every local note in bounded, one-way device batches", async () => {
    const directory = mkdtempSync(join(tmpdir(), "language-coach-sync-test-"));
    temporaryDirectories.push(directory);
    const store = new SqliteLearningStore(join(directory, "notes.sqlite"));
    for (let index = 0; index < 205; index += 1) {
      store.saveNote({
        turnId: `turn-${index}`,
        inputLanguage: "target",
        originalExpression: `Original ${index}`,
        polishedExpression: `Polished ${index}`,
        corrections: [],
        patterns: [],
        examples: [],
      });
    }

    const deviceId = "123e4567-e89b-42d3-a456-426614174000";
    const batches: SyncUploadBatch[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const batch = JSON.parse(String(init?.body)) as SyncUploadBatch;
      batches.push(batch);
      return Response.json({
        deviceId,
        acceptedNotes: batch.notes.length,
        acceptedDeletions: batch.deletedNotes.length,
        syncedAt: "2026-09-01T00:00:00.000Z",
      });
    });

    const sync = new RemoteLearningSync(store, {
      LANGUAGE_COACH_SYNC_CONFIG_PATH: join(directory, "remote-sync.json"),
    });
    sync.configure({
      remoteUrl: "https://language-coach.example",
      token: "lc_abcdefghijklmnopqrstuvwxyz0123456789",
      userId: "user-1",
      deviceId,
      deviceName: "Test laptop",
    });

    await expect(sync.sync()).resolves.toMatchObject({ acceptedNotes: 205, deviceId });
    expect(batches.map((batch) => batch.notes.length)).toEqual([100, 100, 5]);
    expect(batches.every((batch) => batch.deviceId === deviceId)).toBe(true);
    expect(batches[0]?.profile).toEqual(store.getProfile());
    expect(batches.slice(1).every((batch) => batch.profile === undefined)).toBe(true);
    expect(sync.status).toMatchObject({ state: "idle", completedItems: 205, totalItems: 205 });
    store.close();
  });

  it("runs another upload when local data changes during an active upload", async () => {
    const directory = mkdtempSync(join(tmpdir(), "language-coach-sync-race-test-"));
    temporaryDirectories.push(directory);
    const store = new SqliteLearningStore(join(directory, "notes.sqlite"));
    const saveNote = (index: number) => store.saveNote({
      turnId: `turn-${index}`,
      inputLanguage: "target",
      originalExpression: `Original ${index}`,
      polishedExpression: `Polished ${index}`,
      corrections: [],
      patterns: [],
      examples: [],
    });
    saveNote(1);

    const deviceId = "123e4567-e89b-42d3-a456-426614174000";
    let releaseFirstUpload!: () => void;
    const firstUpload = new Promise<void>((resolve) => { releaseFirstUpload = resolve; });
    const batches: SyncUploadBatch[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const batch = JSON.parse(String(init?.body)) as SyncUploadBatch;
      batches.push(batch);
      if (batches.length === 1) await firstUpload;
      return Response.json({
        deviceId,
        acceptedNotes: batch.notes.length,
        acceptedDeletions: 0,
        syncedAt: "2026-09-01T00:00:00.000Z",
      });
    });

    const sync = new RemoteLearningSync(store, {
      LANGUAGE_COACH_SYNC_CONFIG_PATH: join(directory, "remote-sync.json"),
    });
    sync.configure({
      remoteUrl: "https://language-coach.example",
      token: "lc_abcdefghijklmnopqrstuvwxyz0123456789",
      userId: "user-1",
      deviceId,
    });

    const activeUpload = sync.sync();
    saveNote(2);
    const queuedUpload = sync.sync();
    releaseFirstUpload();
    await Promise.all([activeUpload, queuedUpload]);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.notes).toHaveLength(1);
    expect(batches[1]?.notes).toHaveLength(2);
    store.close();
  });
});
