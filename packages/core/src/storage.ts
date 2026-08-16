import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  Correction,
  CorrectionCategory,
  DashboardData,
  LanguageProfile,
  LearningNote,
  LearningNoteInput,
  LearningPattern,
  ProgressSummary,
  TransferExample,
  InputLanguageKind,
} from "./types.js";

export interface LearningStore {
  getProfile(): LanguageProfile;
  updateProfile(input: Partial<Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">>): LanguageProfile;
  saveNote(input: LearningNoteInput): LearningNote;
  hasNoteForTurn(turnId: string): boolean;
  listNotes(limit?: number): LearningNote[];
  deleteNote(id: string): boolean;
  getProgress(): ProgressSummary;
  getDashboardData(limit?: number): DashboardData;
  close(): void;
}

export function resolveDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.LANGUAGE_COACH_DB_PATH || join(homedir(), ".language-coach", "language-coach.sqlite");
}

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type NoteRow = {
  id: string;
  turn_id: string | null;
  input_language: InputLanguageKind;
  original_expression: string;
  polished_expression: string;
  corrections_json: string;
  patterns_json: string;
  examples_json: string;
  native_language: string;
  target_language: string;
  created_at: string;
};

function mapNote(row: NoteRow): LearningNote {
  return {
    id: row.id,
    turnId: row.turn_id ?? undefined,
    inputLanguage: row.input_language || "other",
    originalExpression: row.original_expression,
    polishedExpression: row.polished_expression,
    corrections: parseJson<Correction[]>(row.corrections_json, []),
    patterns: parseJson<LearningPattern[]>(row.patterns_json, []),
    examples: parseJson<TransferExample[]>(row.examples_json, []),
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    createdAt: row.created_at,
  };
}

export class SqliteLearningStore implements LearningStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = resolveDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        native_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        coach_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_notes (
        id TEXT PRIMARY KEY,
        turn_id TEXT UNIQUE,
        input_language TEXT NOT NULL DEFAULT 'other' CHECK (input_language IN ('native', 'target', 'mixed', 'other')),
        original_expression TEXT NOT NULL,
        polished_expression TEXT NOT NULL,
        corrections_json TEXT NOT NULL,
        patterns_json TEXT NOT NULL,
        examples_json TEXT NOT NULL,
        native_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_learning_notes_created_at
        ON learning_notes(created_at DESC);
    `);
    const noteColumns = this.database.prepare("PRAGMA table_info(learning_notes)").all() as Array<{ name: string }>;
    if (!noteColumns.some((column) => column.name === "input_language")) {
      this.database.exec("ALTER TABLE learning_notes ADD COLUMN input_language TEXT NOT NULL DEFAULT 'other'");
    }
    const timestamp = now();
    this.database
      .prepare(`INSERT OR IGNORE INTO profile
        (id, native_language, target_language, coach_enabled, updated_at)
        VALUES (1, 'Chinese', 'English', 1, ?)`)
      .run(timestamp);
  }

  getProfile(): LanguageProfile {
    const row = this.database.prepare("SELECT * FROM profile WHERE id = 1").get() as {
      native_language: string;
      target_language: string;
      coach_enabled: number;
      updated_at: string;
    };
    return {
      nativeLanguage: row.native_language,
      targetLanguage: row.target_language,
      coachEnabled: Boolean(row.coach_enabled),
      updatedAt: row.updated_at,
    };
  }

  updateProfile(input: Partial<Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">>): LanguageProfile {
    const current = this.getProfile();
    const next = {
      nativeLanguage: input.nativeLanguage?.trim() || current.nativeLanguage,
      targetLanguage: input.targetLanguage?.trim() || current.targetLanguage,
      coachEnabled: input.coachEnabled ?? current.coachEnabled,
      updatedAt: now(),
    };
    this.database
      .prepare(`UPDATE profile SET native_language = ?, target_language = ?, coach_enabled = ?, updated_at = ? WHERE id = 1`)
      .run(next.nativeLanguage, next.targetLanguage, next.coachEnabled ? 1 : 0, next.updatedAt);
    return next;
  }

  saveNote(input: LearningNoteInput): LearningNote {
    const profile = this.getProfile();
    const note: LearningNote = {
      ...input,
      id: randomUUID(),
      inputLanguage: input.inputLanguage || "other",
      originalExpression: input.originalExpression.trim(),
      polishedExpression: input.polishedExpression.trim(),
      nativeLanguage: input.nativeLanguage?.trim() || profile.nativeLanguage,
      targetLanguage: input.targetLanguage?.trim() || profile.targetLanguage,
      createdAt: now(),
    };
    if (!note.originalExpression || !note.polishedExpression) {
      throw new Error("Both originalExpression and polishedExpression are required.");
    }

    const existing = input.turnId
      ? (this.database.prepare("SELECT id FROM learning_notes WHERE turn_id = ?").get(input.turnId) as { id: string } | undefined)
      : undefined;
    if (existing) {
      const row = this.database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(existing.id) as NoteRow;
      return mapNote(row);
    }

    this.database
      .prepare(`INSERT INTO learning_notes (
        id, turn_id, input_language, original_expression, polished_expression, corrections_json,
        patterns_json, examples_json, native_language, target_language, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        note.id,
        note.turnId ?? null,
        note.inputLanguage,
        note.originalExpression,
        note.polishedExpression,
        JSON.stringify(note.corrections),
        JSON.stringify(note.patterns),
        JSON.stringify(note.examples),
        note.nativeLanguage,
        note.targetLanguage,
        note.createdAt,
      );
    return note;
  }

  hasNoteForTurn(turnId: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM learning_notes WHERE turn_id = ?").get(turnId));
  }

  listNotes(limit = 100): LearningNote[] {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare("SELECT * FROM learning_notes ORDER BY created_at DESC LIMIT ?")
      .all(safeLimit) as unknown as NoteRow[];
    return rows.map(mapNote);
  }

  deleteNote(id: string): boolean {
    return this.database.prepare("DELETE FROM learning_notes WHERE id = ?").run(id).changes > 0;
  }

  getProgress(): ProgressSummary {
    const notes = this.listNotes(500);
    const today = new Date();
    const dayKey = (date: Date) => date.toISOString().slice(0, 10);
    const counts = new Map<string, number>();
    for (const note of notes) {
      const key = note.createdAt.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const weeklyActivity = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(today);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - offset));
      const dateString = dayKey(date);
      return { date: dateString, count: counts.get(dateString) ?? 0 };
    });

    let currentStreak = 0;
    for (let offset = 0; offset < 366; offset += 1) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - offset);
      if ((counts.get(dayKey(date)) ?? 0) > 0) currentStreak += 1;
      else if (offset > 0 || counts.size > 0) break;
    }

    const categoryMap = new Map<CorrectionCategory, number>();
    const patternMap = new Map<string, { explanation: string; count: number }>();
    const languageUse = { native: 0, target: 0, mixed: 0, other: 0 };
    for (const note of notes) {
      languageUse[note.inputLanguage] += 1;
      for (const correction of note.corrections) {
        categoryMap.set(correction.category, (categoryMap.get(correction.category) ?? 0) + 1);
      }
      for (const pattern of note.patterns) {
        const key = pattern.pattern.trim().toLocaleLowerCase();
        const item = patternMap.get(key) ?? { explanation: pattern.explanation, count: 0 };
        item.count += 1;
        patternMap.set(key, item);
      }
    }

    return {
      totalNotes: notes.length,
      notesThisWeek: weeklyActivity.reduce((sum, item) => sum + item.count, 0),
      activeDays: counts.size,
      currentStreak,
      weeklyActivity,
      categoryCounts: [...categoryMap.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      recurringPatterns: [...patternMap.entries()]
        .map(([pattern, value]) => ({ pattern, ...value }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      languageUse: {
        ...languageUse,
        targetShare: languageUse.native + languageUse.target > 0
          ? Math.round((languageUse.target / (languageUse.native + languageUse.target)) * 100)
          : 0,
      },
    };
  }

  getDashboardData(limit = 100): DashboardData {
    return { profile: this.getProfile(), notes: this.listNotes(limit), progress: this.getProgress() };
  }

  close(): void {
    this.database.close();
  }
}
