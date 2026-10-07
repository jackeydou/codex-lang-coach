import { describe, expect, it } from "vitest"

import { resolveDashboardRoute } from "@/dashboard-route"

describe("Dashboard destinations", () => {
  it.each([
    ["/dashboard", "flashcards"],
    ["/dashboard/", "flashcards"],
    ["/dashboard/activity", "activity"],
    ["/dashboard/activity/", "activity"],
    ["/dashboard/activity/history", "activity"],
    ["/dashboard/patterns", "patterns"],
    ["/dashboard/patterns/", "patterns"],
    ["/dashboard/patterns/details", "patterns"],
    ["/dashboard/settings", "settings"],
    ["/dashboard/settings/", "settings"],
    ["/dashboard/settings/language", "settings"],
  ])("selects %s without falling back to another page", (pathname, page) => {
    expect(resolveDashboardRoute(pathname)).toEqual({ page })
  })

  it.each([
    ["/dashboard/notes", "flashcards", "/dashboard"],
    ["/dashboard/notes/", "flashcards", "/dashboard"],
    ["/dashboard/notes/old-note", "flashcards", "/dashboard"],
    ["/dashboard/insights", "activity", "/dashboard/activity"],
    ["/dashboard/insights/", "activity", "/dashboard/activity"],
    ["/dashboard/insights/history", "activity", "/dashboard/activity"],
  ])("redirects the legacy URL %s to its current destination", (pathname, page, redirectTo) => {
    expect(resolveDashboardRoute(pathname)).toEqual({ page, redirectTo })
  })

  it.each([
    "/dashboard/activity-log",
    "/dashboard/patterns-other",
    "/dashboard/settings-old",
    "/dashboard/notes-other",
    "/dashboard/insights-other",
  ])("does not match similarly named paths such as %s", (pathname) => {
    expect(resolveDashboardRoute(pathname)).toEqual({ page: "flashcards" })
  })
})
