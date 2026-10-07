import type { DashboardData, DashboardNote, ReviewState } from "@language-coach/core"
import { describe, expect, it } from "vitest"
import { applyReview, mergeNotes, preserveReviews } from "./review-state"
import { emptyReviewState, advanceReview } from "@language-coach/core/review"

const at = "2026-10-03T12:00:00.000Z"
function note(id: string, review: ReviewState = emptyReviewState()): DashboardNote {
  return { id, inputLanguage: "target", originalExpression: id, polishedExpression: id, corrections: [], patterns: [], examples: [], nativeLanguage: "Chinese", targetLanguage: "English", createdAt: at, review }
}
function data(notes: DashboardNote[]): DashboardData {
  return { notes, profile: {} as DashboardData["profile"], progress: {} as DashboardData["progress"], reviewSummary: { due: 0, new: notes.length, scheduled: 0, asOf: at } }
}
describe("review response reconciliation", () => {
  it("updates a card and round counts without moving cards or counting a retry twice", () => {
    const original = data([note("a"), note("b")])
    const result = { id: "a", review: advanceReview(emptyReviewState(), at) }
    const updated = applyReview(original, result)
    expect(updated.notes.map((n) => n.id)).toEqual(["a", "b"])
    expect(updated.reviewSummary).toMatchObject({ new: 1, scheduled: 1 })
    expect(applyReview(updated, result)).toBe(updated)
  })
  it("does not overwrite a newer review with an older page response", () => {
    const review = advanceReview(emptyReviewState(), at)
    expect(mergeNotes([note("a", review)], [note("a"), note("b")])[0]?.review).toEqual(review)
    expect(preserveReviews(data([note("a", review)]), data([note("a")])).reviewSummary).toMatchObject({ new: 0, scheduled: 1 })
  })
})
