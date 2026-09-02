import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteLearningStore } from "../src/storage.js";

const temporaryDirectories: string[] = [];

function createStore(): SqliteLearningStore {
  const directory = mkdtempSync(join(tmpdir(), "language-coach-test-"));
  temporaryDirectories.push(directory);
  return new SqliteLearningStore(join(directory, "test.sqlite"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SqliteLearningStore", () => {
  it("defaults to Chinese → English and updates the profile", () => {
    const store = createStore();
    expect(store.getProfile()).toMatchObject({
      nativeLanguage: "Chinese",
      targetLanguage: "English",
      coachEnabled: true,
    });

    expect(store.updateProfile({ nativeLanguage: "Japanese", targetLanguage: "French" })).toMatchObject({
      nativeLanguage: "Japanese",
      targetLanguage: "French",
    });
    store.close();
  });

  it("saves only structured learning fields and is idempotent by turn", () => {
    const store = createStore();
    const input = {
      turnId: "turn-1",
      inputLanguage: "target" as const,
      originalExpression: "Does plugins supports hooks?",
      polishedExpression: "Do plugins support hooks?",
      corrections: [{ original: "Does plugins supports", replacement: "Do plugins support", reason: "Use do and the base verb with a plural subject.", category: "grammar" as const }],
      patterns: [{ pattern: "Do + plural subject + base verb?", explanation: "Use do with plural subjects." }],
      examples: [{ context: "work" as const, text: "Do these reports include refunds?" }],
    };

    const first = store.saveNote(input);
    const second = store.saveNote({ ...input, polishedExpression: "This should not overwrite the note." });
    expect(second.id).toBe(first.id);
    expect(store.listNotes()).toHaveLength(1);
    expect(store.hasNoteForTurn("turn-1")).toBe(true);
    store.close();
  });

  it("reports native, target, mixed, and other usage separately", () => {
    const store = createStore();
    for (const [index, inputLanguage] of ["native", "target", "target", "mixed", "other"].entries()) {
      store.saveNote({
        turnId: `turn-${index}`,
        inputLanguage: inputLanguage as "native" | "target" | "mixed" | "other",
        originalExpression: `Original ${index}`,
        polishedExpression: `Polished ${index}`,
        corrections: [],
        patterns: [],
        examples: [],
      });
    }

    const progress = store.getProgress();
    expect(progress.activity90Days).toHaveLength(90);
    expect(progress.weeklyActivity).toEqual(progress.activity90Days.slice(-7));
    expect(progress.languageUse).toEqual({
      native: 1,
      target: 2,
      mixed: 1,
      other: 1,
      targetShare: 67,
    });
    store.close();
  });

  it("includes every local note and deletion in the upload snapshot", () => {
    const store = createStore();
    let deletedId = "";
    for (let index = 0; index < 525; index += 1) {
      const note = store.saveNote({
        turnId: `sync-turn-${index}`,
        inputLanguage: "target",
        originalExpression: "I look forward to meet you.",
        polishedExpression: "I look forward to meeting you.",
        corrections: [],
        patterns: [],
        examples: [],
      });
      if (index === 0) deletedId = note.id;
    }

    expect(store.deleteNote(deletedId)).toBe(true);
    const snapshot = store.getSyncSnapshot("https://sync.example", "user-1");
    expect(snapshot.notes).toHaveLength(524);
    expect(snapshot.deletedNotes).toContainEqual(expect.objectContaining({ id: deletedId }));
    expect(store.getProgress().totalNotes).toBe(524);
    const firstPage = store.getDashboardData(50);
    const secondPage = store.getDashboardData(50, firstPage.notesPage?.nextCursor);
    expect(firstPage.notes).toHaveLength(50);
    expect(firstPage.notesPage?.hasMore).toBe(true);
    expect(secondPage.notes).toHaveLength(50);
    expect(secondPage.notes.some((note) => firstPage.notes.some((first) => first.id === note.id))).toBe(false);
    store.close();
  });

  it("returns only revisions newer than each remote account checkpoint", () => {
    const store = createStore();
    const first = store.saveNote({
      turnId: "incremental-1",
      inputLanguage: "target",
      originalExpression: "First original",
      polishedExpression: "First polished",
      corrections: [],
      patterns: [],
      examples: [],
    });

    const initial = store.getSyncSnapshot("https://sync.example/", "user-1");
    expect(initial.profile).toBeDefined();
    expect(initial.notes.map((note) => note.id)).toEqual([first.id]);
    store.markSyncCheckpoint("https://sync.example", "user-1", initial.throughRevision, "2026-09-01T00:00:00.000Z");

    const unchanged = store.getSyncSnapshot("https://sync.example", "user-1");
    expect(unchanged).toMatchObject({ profile: undefined, notes: [], deletedNotes: [] });
    expect(store.getSyncCheckpoint("https://sync.example/", "user-1")).toEqual({
      revision: initial.throughRevision,
      lastSyncedAt: "2026-09-01T00:00:00.000Z",
    });

    expect(store.deleteNote(first.id)).toBe(true);
    const second = store.saveNote({
      turnId: "incremental-2",
      inputLanguage: "target",
      originalExpression: "Second original",
      polishedExpression: "Second polished",
      corrections: [],
      patterns: [],
      examples: [],
    });
    const incremental = store.getSyncSnapshot("https://sync.example", "user-1");
    expect(incremental.profile).toBeUndefined();
    expect(incremental.notes.map((note) => note.id)).toEqual([second.id]);
    expect(incremental.deletedNotes).toContainEqual(expect.objectContaining({ id: first.id }));

    const otherAccount = store.getSyncSnapshot("https://sync.example", "user-2");
    expect(otherAccount.profile).toBeDefined();
    expect(otherAccount.notes.map((note) => note.id)).toEqual([second.id]);
    expect(otherAccount.deletedNotes).toContainEqual(expect.objectContaining({ id: first.id }));
    store.close();
  });

  it("migrates an existing database into the revision model", () => {
    const directory = mkdtempSync(join(tmpdir(), "language-coach-legacy-test-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "legacy.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE profile (id INTEGER PRIMARY KEY, native_language TEXT NOT NULL, target_language TEXT NOT NULL,
        coach_enabled INTEGER NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO profile VALUES (1, 'Chinese', 'English', 1, '2026-08-01T00:00:00.000Z');
      CREATE TABLE learning_notes (id TEXT PRIMARY KEY, turn_id TEXT UNIQUE, input_language TEXT NOT NULL,
        original_expression TEXT NOT NULL, polished_expression TEXT NOT NULL, corrections_json TEXT NOT NULL,
        patterns_json TEXT NOT NULL, examples_json TEXT NOT NULL, native_language TEXT NOT NULL,
        target_language TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO learning_notes VALUES ('123e4567-e89b-42d3-a456-426614174000', 'legacy-turn', 'target',
        'Legacy original', 'Legacy polished', '[]', '[]', '[]', 'Chinese', 'English', '2026-08-01T00:00:00.000Z');
      CREATE TABLE deleted_learning_notes (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
    `);
    legacy.close();

    const store = new SqliteLearningStore(databasePath);
    const snapshot = store.getSyncSnapshot("https://sync.example", "legacy-user");
    expect(snapshot.throughRevision).toBeGreaterThan(0);
    expect(snapshot.profile).toBeDefined();
    expect(snapshot.notes).toHaveLength(1);
    store.markSyncCheckpoint("https://sync.example", "legacy-user", snapshot.throughRevision, "2026-09-01T00:00:00.000Z");
    expect(store.getSyncSnapshot("https://sync.example", "legacy-user").notes).toHaveLength(0);
    store.close();
  });
});
