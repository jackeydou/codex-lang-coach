import type { ReviewState } from "./types.js";

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const REVIEW_SESSION_TTL_MS = 30 * 60 * 1000;

export function emptyReviewState(): ReviewState {
  return { stage: 0, reviewCount: 0, lastReviewedAt: null, nextReviewAt: null, version: 0, algorithmVersion: "fixed-v1" };
}

export function isReviewDue(review: ReviewState, at = Date.now()): boolean {
  return review.stage === 0 || (review.nextReviewAt !== null && Date.parse(review.nextReviewAt) <= at);
}

export function advanceReview(review: ReviewState, at: string): ReviewState {
  const stage = Math.min(review.stage + 1, REVIEW_INTERVAL_DAYS.length);
  return {
    stage,
    reviewCount: review.reviewCount + 1,
    lastReviewedAt: at,
    nextReviewAt: new Date(Date.parse(at) + REVIEW_INTERVAL_DAYS[stage - 1]! * 86_400_000).toISOString(),
    version: review.version + 1,
    algorithmVersion: "fixed-v1",
  };
}

export type ReviewErrorCode = "INVALID_REQUEST" | "NOT_FOUND" | "VERSION_CONFLICT" | "NOT_DUE" | "SESSION_EXPIRED";

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
    readonly review?: ReviewState,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
