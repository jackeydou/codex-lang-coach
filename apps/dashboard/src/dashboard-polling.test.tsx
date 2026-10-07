// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import type { DashboardData, DashboardNote, DashboardStatus, LanguageProfile } from "@language-coach/core"
import { calculateProgress } from "@language-coach/core/progress"
import { advanceReview, emptyReviewState } from "@language-coach/core/review"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { DashboardApp } from "./App"
import type { LearningDashboardClient } from "./dashboard-api"
import { useDashboardStatusPolling } from "./hooks/use-dashboard-status-polling"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"))
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button!.click())
}

it("preserves the active reviewed card and original pagination through embedded polling and focus", async () => {
  const profile: LanguageProfile = { nativeLanguage: "Chinese", targetLanguage: "English", coachEnabled: true, updatedAt: new Date().toISOString() }
  let notes: DashboardNote[] = Array.from({ length: 60 }, (_, index) => ({
    id: `poll-${index}`, inputLanguage: "target", originalExpression: `Original ${index}`, polishedExpression: `Polished ${index}`,
    corrections: [], patterns: [], examples: [], nativeLanguage: "Chinese", targetLanguage: "English",
    createdAt: new Date(Date.now() + index * 1000).toISOString(), review: emptyReviewState(),
  })).reverse() as DashboardNote[]
  let firstPage: DashboardData | undefined
  const initialDeck = [...notes]
  const getDashboard = vi.fn<LearningDashboardClient["getDashboard"]>(async (cursor) => {
    const ranked = cursor ? initialDeck : [...notes.filter((note) => note.review?.stage === 0), ...notes.filter((note) => note.review?.stage !== 0)]
    const page: DashboardData = {
      profile, progress: calculateProgress(notes), capabilities: { reviewScheduling: true },
      notes: cursor ? ranked.slice(50) : ranked.slice(0, 50),
      notesPage: { limit: 50, hasMore: !cursor, nextCursor: cursor ? undefined : "initial-cursor" },
      reviewSummary: { due: 0, new: notes.filter((note) => note.review?.stage === 0).length, scheduled: notes.filter((note) => note.review?.stage !== 0).length, asOf: new Date().toISOString() },
    }
    if (!firstPage) firstPage = page
    return page
  })
  const getDashboardStatus = vi.fn(async () => ({ profile, progress: calculateProgress(notes), sync: { enabled: false } }))
  const client: LearningDashboardClient = {
    getDashboard, getDashboardStatus,
    updateProfile: async () => profile,
    deleteNote: async () => ({ deleted: true }),
    markReviewed: async ({ id }) => {
      const note = notes.find((note) => note.id === id)!
      const review = advanceReview(note.review!, new Date().toISOString())
      notes = notes.map((note) => note.id === id ? { ...note, review } : note)
      return { id, review }
    },
  }
  await act(async () => root.render(<MemoryRouter initialEntries={["/dashboard"]}>
    <DashboardApp embedded={{ client, openStandalone: async () => {} }} />
  </MemoryRouter>))
  const activeExpression = () => container.querySelector(".deck-active-card blockquote")?.textContent
  const originalExpression = activeExpression()
  expect(originalExpression).toContain("Original 59")
  await click(".deck-active-card .flashcard-review-action button")
  expect(container.querySelector(".deck-active-card .flashcard-review-action")?.textContent).toContain("Reviewed")

  notes = [{ ...notes[0]!, id: "added", originalExpression: "Added elsewhere", polishedExpression: "Added elsewhere", review: emptyReviewState() }, ...notes]
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
    window.dispatchEvent(new Event("focus"))
    await Promise.resolve()
    document.dispatchEvent(new Event("visibilitychange"))
  })
  expect(getDashboardStatus).toHaveBeenCalledTimes(3)
  expect(getDashboard).toHaveBeenCalledTimes(1)
  expect(activeExpression()).toBe(originalExpression)
  expect(container.querySelector(".flashcard-deck-status")?.textContent).toContain("50")
  expect(container.querySelector(".activity-heatmap")?.parentElement?.textContent).toContain("61")

  // Reading past the first page must still use the initial session's cursor.
  for (let index = 0; index < 48; index++) await click('button[aria-label="Next card"]')
  expect(getDashboard).toHaveBeenCalledTimes(2)
  expect(getDashboard.mock.calls[1]).toEqual([firstPage!.notesPage!.nextCursor, "review"])
  expect(container.querySelector(".flashcard-deck-status")?.textContent).toContain("60")
  expect(container.textContent).not.toContain("Added elsewhere")

  // Only the user's explicit refresh creates a new deck.
  await click(".review-toolbar button")
  expect(getDashboard.mock.calls.filter(([cursor]) => !cursor)).toEqual([[undefined, "review"], [undefined, "review"]])
  expect(container.querySelector(".activity-heatmap")?.parentElement?.textContent).toContain("61")
})

function Probe({ client, onStatus, onError, syncing = false }: {
  client: LearningDashboardClient
  onStatus: (status: DashboardStatus) => void
  onError: (error: unknown) => void
  syncing?: boolean
}) {
  useDashboardStatusPolling({ client, embedded: true, syncing, onStatus, onError })
  return null
}

it("coalesces poll and focus requests and discards a status response after unmount", async () => {
  let resolve: (status: DashboardStatus) => void = () => {}
  const getDashboardStatus = vi.fn(() => new Promise<DashboardStatus>((done) => { resolve = done }))
  const client = { getDashboardStatus } as unknown as LearningDashboardClient
  const onStatus = vi.fn()
  await act(async () => root.render(<Probe client={client} onStatus={onStatus} onError={vi.fn()} syncing />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500)
    window.dispatchEvent(new Event("focus"))
  })
  expect(getDashboardStatus).toHaveBeenCalledTimes(1)
  await act(async () => root.render(null))
  await act(async () => resolve({ profile: {} as DashboardStatus["profile"], progress: {} as DashboardStatus["progress"] }))
  expect(onStatus).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); window.dispatchEvent(new Event("focus")) })
  expect(getDashboardStatus).toHaveBeenCalledTimes(1)
})

it("skips hidden panels and recovers from a status failure without reloading the deck", async () => {
  const error = new Error("Offline")
  const status = { profile: {} as DashboardStatus["profile"], progress: {} as DashboardStatus["progress"] }
  const getDashboardStatus = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(status)
  const client = { getDashboardStatus } as unknown as LearningDashboardClient
  const onStatus = vi.fn()
  const onError = vi.fn()
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
  await act(async () => root.render(<Probe client={client} onStatus={onStatus} onError={onError} />))
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); window.dispatchEvent(new Event("focus")) })
  expect(getDashboardStatus).not.toHaveBeenCalled()
  visibility.mockReturnValue("visible")
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
  expect(onError).toHaveBeenCalledWith(error)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(onStatus).toHaveBeenCalledWith(status)
})
