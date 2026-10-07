import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteLearningStore } from "../src/storage.js";
import { REVIEW_INTERVAL_DAYS, REVIEW_SESSION_TTL_MS, ReviewError } from "../src/review.js";
import type { LearningNote } from "../src/types.js";

const cleanup: (() => void)[] = [];
const baseTime = Date.parse("2026-10-03T12:00:00.000Z");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(baseTime); });
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); vi.useRealTimers(); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "language-review-"));
  const path = join(dir, "test.sqlite");
  const store = new SqliteLearningStore(path);
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }), () => store.close());
  return { store, path };
}
function save(store: SqliteLearningStore, label: string): LearningNote {
  return store.saveNote({ turnId: label, inputLanguage: "target", originalExpression: label, polishedExpression: `${label} polished`, corrections: [], patterns: [], examples: [] });
}
function review(store: SqliteLearningStore, id: string, expectedVersion = 0) {
  return store.markReviewed({ id, expectedVersion, requestId: randomUUID() });
}

describe("local review scheduling", () => {
  it("treats historical notes as new and does not turn reading into a review", () => {
    const { store } = fixture();
    save(store, "old note");
    const first = store.getDashboardData(50, undefined, "review");
    expect(first.notes[0]?.review).toMatchObject({ stage: 0, reviewCount: 0, nextReviewAt: null, version: 0 });
    expect(first.reviewSummary).toMatchObject({ due: 0, new: 1, scheduled: 0 });
    expect(store.getDashboardData().notes[0]?.review?.reviewCount).toBe(0);
  });

  it("advances at the due boundary, caps the stage, and schedules late reviews from completion", () => {
    const { store } = fixture();
    const note = save(store, "schedule");
    let timestamp = baseTime;
    for (let index = 0; index < 8; index++) {
      const result = review(store, note.id, index);
      const interval = REVIEW_INTERVAL_DAYS[Math.min(index, 5)]!;
      expect(result.review).toMatchObject({ stage: Math.min(index + 1, 6), reviewCount: index + 1, version: index + 1 });
      expect(Date.parse(result.review.nextReviewAt!)).toBe(timestamp + interval * 86_400_000);
      timestamp = Date.parse(result.review.nextReviewAt!) + (index === 1 ? 7 * 86_400_000 : 0);
      vi.setSystemTime(timestamp);
    }
    expect(store.getProgress().totalNotes).toBe(1);
  });

  it("deduplicates retries, rejects reused IDs, early reviews, stale versions and invalid input", () => {
    const { store } = fixture();
    const note = save(store, "retry");
    const other = save(store, "other");
    const input = { id: note.id, requestId: randomUUID(), expectedVersion: 0 };
    const result = store.markReviewed(input);
    vi.setSystemTime(baseTime + 1000);
    expect(store.markReviewed(input)).toEqual(result);
    expect(() => store.markReviewed({ ...input, id: other.id })).toThrow("different review");
    expect(() => store.markReviewed({ ...input, expectedVersion: 1 })).toThrow("different review");
    expect(() => review(store, note.id, 1)).toThrow("not due");
    expect(() => review(store, note.id, 0)).toThrow("updated elsewhere");
    expect(() => review(store, "missing")).toThrow("no longer exists");
    expect(() => store.markReviewed({ ...input, requestId: "invalid" })).toThrow(ReviewError);
    expect(() => store.markReviewed({ ...input, expectedVersion: NaN })).toThrow(ReviewError);
    expect(store.getDashboardData().notes.find((n) => n.id === note.id)?.review?.reviewCount).toBe(1);
  });

  it("shares persisted state across SQLite connections and leaves upload revisions unchanged", () => {
    const { store, path } = fixture();
    const note = save(store, "persist");
    const before = store.getSyncSnapshot("https://example.com", "user");
    review(store, note.id);
    const reopened = new SqliteLearningStore(path);
    cleanup.push(() => reopened.close());
    expect(reopened.getDashboardData().notes[0]?.review?.version).toBe(1);
    expect(store.getSyncSnapshot("https://example.com", "user")).toEqual(before);
    save(store, "second persistent card");
    const firstPage = store.getDashboardData(1, undefined, "review");
    expect(reopened.getDashboardData(1, firstPage.notesPage?.nextCursor, "review").notes[0]?.id).toBe(note.id);
    expect(() => review(reopened, note.id)).toThrow("updated elsewhere");
    expect(store.listNotes()[0]).not.toHaveProperty("review");
    store.deleteNote(note.id);
    const db = new DatabaseSync(path);
    expect(db.prepare("SELECT count(*) AS count FROM learning_note_reviews").get()).toMatchObject({ count: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM learning_review_events").get()).toMatchObject({ count: 0 });
    db.close();
  });

  it("rolls back progress if the event cannot be persisted", () => {
    const { store, path } = fixture();
    const note = save(store, "atomic write");
    const db = new DatabaseSync(path);
    db.exec(`CREATE TRIGGER reject_review_event BEFORE INSERT ON learning_review_events
      BEGIN SELECT RAISE(ABORT, 'Review event failed'); END;`);
    const input = { id: note.id, requestId: randomUUID(), expectedVersion: 0 };
    expect(() => store.markReviewed(input)).toThrow("Review event failed");
    expect(store.getDashboardData().notes[0]?.review?.version).toBe(0);
    db.exec("DROP TRIGGER reject_review_event");
    expect(store.markReviewed(input).review.reviewCount).toBe(1);
    db.close();
  });

  it("sorts all notes before pagination, with due notes before new and scheduled notes", () => {
    const { store } = fixture();
    const old = save(store, "old due");
    review(store, old.id);
    vi.setSystemTime(baseTime + 2 * 86_400_000);
    const dueLater = save(store, "later due");
    review(store, dueLater.id);
    vi.setSystemTime(baseTime + 4 * 86_400_000);
    const scheduled = save(store, "scheduled");
    review(store, scheduled.id);
    const newest = Array.from({ length: 60 }, (_, index) => { vi.setSystemTime(Date.now() + 1000); return save(store, `new ${index}`); });
    const first = store.getDashboardData(50, undefined, "review");
    expect(first.notes.slice(0, 3).map((n) => n.id)).toEqual([old.id, dueLater.id, newest.at(-1)!.id]);
    expect(first.reviewSummary).toMatchObject({ due: 2, new: 60, scheduled: 1 });
    const second = store.getDashboardData(50, first.notesPage!.nextCursor, "review");
    expect(second.notes.at(-1)?.id).toBe(scheduled.id);
    expect(new Set([...first.notes, ...second.notes].map((n) => n.id)).size).toBe(63);
    expect(store.getDashboardData(1).notes[0]?.id).toBe(newest.at(-1)!.id);
  });

  it("keeps snapshot pagination stable across reviews, deletions, new notes and due transitions", () => {
    const { store } = fixture();
    const notes = Array.from({ length: 7 }, (_, index) => { vi.setSystemTime(baseTime + index * 1000); return save(store, `stable ${index}`); });
    const first = store.getDashboardData(2, undefined, "review");
    const initialOrder = [...notes].reverse().map((n) => n.id);
    review(store, first.notes[0]!.id);
    store.deleteNote(initialOrder[2]!);
    const extra = save(store, "extra");
    vi.setSystemTime(Date.now() + 10_000);
    const all = [...first.notes];
    let cursor = first.notesPage?.nextCursor;
    while (cursor) {
      const page = store.getDashboardData(2, cursor, "review");
      all.push(...page.notes);
      cursor = page.notesPage?.nextCursor;
    }
    expect(all.map((n) => n.id)).toEqual(initialOrder.filter((id) => id !== initialOrder[2]));
    expect(all.some((n) => n.id === extra.id)).toBe(false);
    const fresh = store.getDashboardData(50, undefined, "review");
    expect(fresh.notes[0]?.id).toBe(extra.id);
    expect(fresh.notes.at(-1)?.id).toBe(first.notes[0]!.id);
  });

  it("freezes groups when scheduled cards become due during the same session", () => {
    const { store } = fixture();
    const scheduled = save(store, "about to be due");
    review(store, scheduled.id);
    vi.setSystemTime(baseTime + 86_400_000 - 10_000);
    save(store, "new one"); save(store, "new two");
    const first = store.getDashboardData(1, undefined, "review");
    vi.setSystemTime(baseTime + 86_400_000);
    const second = store.getDashboardData(1, first.notesPage?.nextCursor, "review");
    expect(second.notes[0]?.id).not.toBe(scheduled.id);
    expect(store.getDashboardData(1, undefined, "review").notes[0]?.id).toBe(scheduled.id);
  });

  it("rejects invalid or expired cursors and cleans up abandoned sessions", () => {
    const { store, path } = fixture();
    save(store, "one"); save(store, "two");
    const cursor = store.getDashboardData(1, undefined, "review").notesPage!.nextCursor!;
    expect(() => store.getDashboardData(1, "invalid", "review")).toThrow("Invalid review cursor");
    expect(() => store.getDashboardData(1, cursor, "recent")).toThrow("cannot be used");
    vi.setSystemTime(baseTime + REVIEW_SESSION_TTL_MS);
    expect(() => store.getDashboardData(1, cursor, "review")).toThrow("expired");
    store.getDashboardData(1, undefined, "review");
    const db = new DatabaseSync(path);
    expect(db.prepare("SELECT count(*) AS count FROM review_sessions").get()).toMatchObject({ count: 1 });
    db.close();
  });
});
