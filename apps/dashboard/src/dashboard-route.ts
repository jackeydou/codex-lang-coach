export type DashboardPage = "flashcards" | "patterns" | "activity" | "settings"

export function resolveDashboardRoute(pathname: string): { page: DashboardPage; redirectTo?: string } {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

  if (matches("/dashboard/notes")) return { page: "flashcards", redirectTo: "/dashboard" }
  if (matches("/dashboard/insights")) return { page: "activity", redirectTo: "/dashboard/activity" }
  if (matches("/dashboard/settings")) return { page: "settings" }
  if (matches("/dashboard/patterns")) return { page: "patterns" }
  if (matches("/dashboard/activity")) return { page: "activity" }
  return { page: "flashcards" }
}
