// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { DashboardNote } from "@language-coach/core"
import { advanceReview, emptyReviewState } from "@language-coach/core/review"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { FlashcardDeck } from "@/components/flashcard-deck"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const notes: DashboardNote[] = ["one", "two", "three"].map((word) => ({
  id: word, inputLanguage: "target", nativeLanguage: "Chinese", targetLanguage: "English", createdAt: "2026-10-04T00:00:00Z",
  originalExpression: `I want discuss about ${word}`, polishedExpression: `I'd like to discuss ${word}`,
  corrections: [{ original: "discuss about", replacement: "discuss", category: "collocation", reason: "Discuss takes a direct object." }],
  patterns: [], examples: [], review: emptyReviewState(),
}))

function Harness({ onReview }: { onReview: (id: string) => Promise<void> }) {
  const [deck, setDeck] = useState(notes)
  const remaining = deck.filter((note) => note.review?.stage === 0).length
  return <FlashcardDeck notes={deck} totalNotes={deck.length} remaining={remaining} hasMore={false} loadingMore={false}
    onLoadMore={async () => {}} onDelete={async () => {}} quiz
    onReview={async (id) => {
      await onReview(id)
      setDeck((current) => current.map((note) => note.id === id ? { ...note, review: advanceReview(note.review!, new Date().toISOString()) } : note))
    }} />
}

async function press(key: string) {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })) })
}

const front = () => container.querySelector(".deck-active-card blockquote")?.textContent

it("grades cards from the keyboard, keeps the streak and celebrates the end of a round", async () => {
  const onReview = vi.fn(async () => {})
  await act(async () => root.render(<Harness onReview={onReview} />))

  expect(front()).toContain("about one")
  expect(container.querySelector(".fc")?.getAttribute("data-flipped")).toBe("false")
  // Grading is only offered once the answer is showing.
  await press("2")
  expect(onReview).not.toHaveBeenCalled()

  await press(" ")
  expect(container.querySelector(".fc")?.getAttribute("data-flipped")).toBe("true")
  const struck = [...container.querySelectorAll(".deck-active-card .fc-back .mark-removed")].map((mark) => mark.textContent)
  expect(struck).toEqual(["I want", "about"])
  await press("1")
  expect(onReview).not.toHaveBeenCalled()
  expect(front()).toContain("about two")
  expect(container.querySelector(".deck-leaving-card[data-kind='again']")).not.toBeNull()

  await press(" ")
  await press("2")
  expect(onReview).toHaveBeenLastCalledWith("two")
  expect(front()).toContain("about three")
  expect(container.querySelector(".deck-hud-streak")?.textContent).toContain("1")

  await press(" ")
  await press("2")
  expect(onReview).toHaveBeenLastCalledWith("three")
  expect(container.querySelector(".deck-complete")).toBeNull()

  await press("ArrowLeft")
  await press("ArrowLeft")
  expect(front()).toContain("about one")
  await press(" ")
  await press("2")
  expect(container.querySelector(".deck-complete")?.textContent).toContain("You reviewed 3 cards")
  expect(container.querySelector(".deck-complete")?.textContent).toContain("best streak of 3")
})
