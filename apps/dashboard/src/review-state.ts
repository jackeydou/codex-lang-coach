import type { DashboardData, DashboardNote, MarkReviewedResult, ReviewState, ReviewSummary } from "@language-coach/core"

function group(review: ReviewState | undefined, asOf: string): keyof Pick<ReviewSummary, "due" | "new" | "scheduled"> {
  if (!review || review.stage === 0) return "new"
  return review.nextReviewAt && review.nextReviewAt <= asOf ? "due" : "scheduled"
}

export function applyReview(data: DashboardData, result: MarkReviewedResult): DashboardData {
  const note = data.notes.find((item) => item.id === result.id)
  if (!note || (note.review?.version ?? 0) >= result.review.version) return data
  const summary = data.reviewSummary ? { ...data.reviewSummary } : undefined
  if (summary) {
    const before = group(note.review, summary.asOf)
    const after = group(result.review, summary.asOf)
    if (before !== after) { summary[before] = Math.max(0, summary[before] - 1); summary[after] += 1 }
  }
  return { ...data, reviewSummary: summary, notes: data.notes.map((item) => item.id === result.id ? { ...item, review: result.review } : item) }
}

// A page request may have read its snapshot before a review response arrived.
export function mergeNotes(existing: DashboardNote[], incoming: DashboardNote[]): DashboardNote[] {
  const notes = new Map(existing.map((note) => [note.id, note]))
  for (const note of incoming) {
    const current = notes.get(note.id)
    notes.set(note.id, current && (current.review?.version ?? 0) > (note.review?.version ?? 0)
      ? { ...note, review: current.review } : note)
  }
  return [...notes.values()]
}

export function preserveReviews(existing: DashboardData | undefined, incoming: DashboardData): DashboardData {
  let data = incoming
  for (const note of existing?.notes ?? []) {
    if (note.review) data = applyReview(data, { id: note.id, review: note.review })
  }
  return data
}
