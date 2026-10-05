import type { DashboardData } from "@language-coach/core"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { ActivityPage, FlashcardsPage, PatternsPage, SettingsPage } from "@/App"

const data: DashboardData = {
  profile: { nativeLanguage: "Chinese", targetLanguage: "English", coachEnabled: true, updatedAt: "2026-10-04T00:00:00Z" },
  notes: [{
    id: "note-1", inputLanguage: "native", nativeLanguage: "Chinese", targetLanguage: "English", createdAt: "2026-10-04T00:00:00Z",
    originalExpression: "按照方案实现", polishedExpression: "Build it based on the plan.",
    corrections: [{ original: "from", replacement: "based on", category: "word-choice", reason: "Name the plan you follow." }],
    patterns: [{ pattern: "Build … based on …", explanation: "Describe the plan you follow." }],
    examples: [{ context: "work", text: "Build a prototype based on the design." }],
  }],
  notesPage: { limit: 50, hasMore: true, nextCursor: "next-page" },
  progress: {
    totalNotes: 456, notesThisWeek: 12, activeDays: 8, currentStreak: 8,
    weeklyActivity: [{ date: "2026-10-04", count: 12 }],
    activity90Days: [{ date: "2026-10-04", count: 12 }],
    categoryCounts: [{ category: "word-choice", count: 3 }],
    recurringPatterns: Array.from({ length: 5 }, (_, index) => ({ pattern: `wire up ${index}`, explanation: "Connect a dependency.", count: 3 })),
    languageUse: { native: 2, target: 8, mixed: 1, other: 0, targetShare: 72 },
  },
}
const noop = async () => {}

describe("Dashboard page boundaries", () => {
  it("keeps note corrections, patterns, examples and navigation on Flash cards", () => {
    const html = renderToStaticMarkup(<FlashcardsPage data={data} loadingMore={false} onLoadMore={noop} onDelete={noop} />)
    for (const content of ["Build it based on the plan.", "What changed", "Reusable patterns", "Transfer examples", 'aria-label="Next card"', "01 / 456"]) {
      expect(html).toContain(content)
    }
    for (const content of ["Practice activity", "wire up 0", "Weekly activity", "Save settings"]) expect(html).not.toContain(content)
  })

  it("shows repeated expressions with details and pagination on their own page", () => {
    const html = renderToStaticMarkup(<PatternsPage data={data} />)
    expect(html).toContain('aria-label="Open pattern: wire up 0"')
    expect(html).toContain("Connect a dependency.")
    expect(html).toContain("1 / 2")
    expect(html).not.toContain("wire up 4")
    for (const content of ["Natural version", "Practice activity", "Weekly activity", "Save settings"]) expect(html).not.toContain(content)
  })

  it("puts the heatmap, all four metrics and all three charts on Activity", () => {
    const html = renderToStaticMarkup(<ActivityPage data={data} />)
    for (const content of ["Practice activity", "Learning notes", "Current streak", "Target-language share", "Top correction", "Weekly activity", "Language use", "Correction mix"]) {
      expect(html).toContain(content)
    }
    for (const content of ["Natural version", "wire up 0", "Save settings", "Open web dashboard"]) expect(html).not.toContain(content)
  })

  it("keeps embedded Settings focused on preferences and the web account entry", () => {
    const html = renderToStaticMarkup(<MemoryRouter><SettingsPage data={data} saving={false} onSave={noop} mode="local" syncChanging={false} onSyncToggle={noop} onSignOut={noop} openStandalone={noop} /></MemoryRouter>)
    for (const content of ["Native language", 'value="Chinese"', "Target language", 'value="English"', "Coach new messages", "Save settings", "Login &amp; sync", "Open web dashboard"]) {
      expect(html).toContain(content)
    }
    for (const content of ["Learning summary", "Practice activity", "Current streak", "Weekly activity", "Language use", "Correction mix", "Upload to your account"]) expect(html).not.toContain(content)
  })

  it("preserves standalone local storage choices and sign-in", () => {
    const html = renderToStaticMarkup(<MemoryRouter><SettingsPage data={data} saving={false} onSave={noop} mode="local" syncChanging={false} onSyncToggle={noop} onSignOut={noop} /></MemoryRouter>)
    expect(html).toContain("Local only")
    expect(html).toContain("Upload to your account")
    expect(html).toContain("Sign in")
    expect(html).not.toContain("Practice activity")
  })
})
