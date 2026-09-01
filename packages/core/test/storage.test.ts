import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    expect(store.getProgress().languageUse).toEqual({
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
    const snapshot = store.getSyncSnapshot();
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
});
