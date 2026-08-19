import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { DashboardData, LanguageProfile, LearningNote } from "@language-coach/core"
import { ActivityIcon, BookOpenCheckIcon, ChartNoAxesCombinedIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon, LanguagesIcon, Settings2Icon, SparklesIcon, TargetIcon } from "lucide-react"

import { ActivityChart, CategoryChart, LanguageUseChart } from "@/components/analytics-charts"
import { NoteFlashcard } from "@/components/note-flashcard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { TooltipProvider } from "@/components/ui/tooltip"

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Request failed with status ${response.status}.`)
  }
  return response.json() as Promise<T>
}

function LoadingDashboard() {
  return (
    <div className="grid min-h-svh grid-cols-1 md:grid-cols-[16rem_1fr]" aria-busy="true" aria-label="Loading dashboard">
      <div className="hidden border-r bg-muted/30 p-4 md:flex md:flex-col md:gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <main className="flex flex-col gap-6 p-4 md:p-8">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-80 w-full" />
      </main>
    </div>
  )
}

function AppSidebar({ data }: { data: DashboardData }) {
  const navigation = [
    { label: "Overview", href: "#overview", icon: ChartNoAxesCombinedIcon },
    { label: "Activity", href: "#activity", icon: ActivityIcon },
    { label: "Flashcards", href: "#flashcards", icon: BookOpenCheckIcon, badge: data.notes.length },
    { label: "Settings", href: "#settings", icon: Settings2Icon },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Language Coach">
              <a href="#overview">
                <span className="brand-mark"><LanguagesIcon /></span>
                <span className="grid gap-0.5 leading-none">
                  <strong>Language Coach</strong>
                  <span className="text-xs text-muted-foreground">Learning analytics</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item, index) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={index === 0} tooltip={item.label}>
                    <a href={item.href}><item.icon /><span>{item.label}</span></a>
                  </SidebarMenuButton>
                  {item.badge !== undefined && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg border p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0">
          <span className={`status-dot ${data.profile.coachEnabled ? "is-active" : ""}`} aria-hidden="true" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">{data.profile.coachEnabled ? "Coach is active" : "Coach is paused"}</p>
            <p className="truncate text-xs text-muted-foreground">{data.profile.nativeLanguage} → {data.profile.targetLanguage}</p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof ActivityIcon }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction><Icon className="metric-icon" /></CardAction>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent>
    </Card>
  )
}

function PatternRanking({ patterns }: { patterns: DashboardData["progress"]["recurringPatterns"] }) {
  const max = Math.max(1, ...patterns.map((item) => item.count))
  if (!patterns.length) return <p className="text-sm text-muted-foreground">Reusable patterns will appear after your first saved lesson.</p>

  return (
    <ol className="flex flex-col gap-4">
      {patterns.slice(0, 5).map((item, index) => (
        <li key={item.pattern} className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{item.pattern}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{item.explanation}</p>
            </div>
            <Badge variant="secondary">{item.count}×</Badge>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`${item.pattern}, seen ${item.count} times`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={item.count}>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function FlashcardDeck({ notes, onDelete }: { notes: LearningNote[]; onDelete: (id: string) => Promise<void> }) {
  const [page, setPage] = useState(0)
  const [direction, setDirection] = useState<"forward" | "backward">("forward")

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, notes.length - 1)))
  }, [notes.length])

  const pageOptions = useMemo(() => {
    if (notes.length <= 5) return notes.map((_, index) => index)
    const candidates = new Set([0, notes.length - 1, page - 1, page, page + 1])
    const pages = [...candidates].filter((item) => item >= 0 && item < notes.length).sort((a, b) => a - b)
    return pages.flatMap<(number | "ellipsis")>((item, index) => {
      const previous = pages[index - 1] ?? item
      return index > 0 && item - previous > 1 ? ["ellipsis", item] : [item]
    })
  }, [notes, page])

  if (!notes.length) return null

  const activeNote = notes[page]
  if (!activeNote) return null
  const remaining = notes.length - page - 1

  function goTo(nextPage: number) {
    const clampedPage = Math.max(0, Math.min(notes.length - 1, nextPage))
    if (clampedPage === page) return
    setDirection(clampedPage > page ? "forward" : "backward")
    setPage(clampedPage)
  }

  return (
    <div className="flashcard-deck" aria-label="Flashcard deck">
      <div className="flashcard-deck-status" aria-live="polite">
        <span><strong>{page + 1}</strong> / {notes.length}</span>
        <span>{remaining ? `${remaining} left in this pass` : "Last card"}</span>
      </div>
      <div className="flashcard-deck-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${(page + 1) / notes.length})` }} />
      </div>

      <div className="flashcard-deck-stage">
        {remaining > 1 && <div className="deck-layer deck-layer-back" aria-hidden="true" />}
        {remaining > 0 && <div className="deck-layer deck-layer-middle" aria-hidden="true" />}
        <div key={activeNote.id} className="deck-active-card" data-direction={direction}>
          <NoteFlashcard note={activeNote} onDelete={onDelete} />
        </div>
      </div>

      <nav className="flashcard-pagination" aria-label="Flashcard pages">
        <Button variant="outline" onClick={() => goTo(page - 1)} disabled={page === 0}>
          <ChevronLeftIcon data-icon="inline-start" /> Previous
        </Button>
        <div className="flashcard-page-list">
          {pageOptions.map((item, index) => item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="flashcard-page-ellipsis" aria-hidden="true">…</span>
          ) : (
            <Button
              key={item}
              size="icon"
              variant={item === page ? "default" : "ghost"}
              onClick={() => goTo(item)}
              aria-label={`Go to card ${item + 1}`}
              aria-current={item === page ? "page" : undefined}
            >
              {item + 1}
            </Button>
          ))}
        </div>
        <Button variant="outline" onClick={() => goTo(page + 1)} disabled={page === notes.length - 1}>
          Next <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </nav>
    </div>
  )
}

function SettingsCard({ profile, saving, onSave }: {
  profile: LanguageProfile
  saving: boolean
  onSave: (profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) => Promise<void>
}) {
  const [nativeLanguage, setNativeLanguage] = useState(profile.nativeLanguage)
  const [targetLanguage, setTargetLanguage] = useState(profile.targetLanguage)
  const [coachEnabled, setCoachEnabled] = useState(profile.coachEnabled)
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    await onSave({ nativeLanguage, targetLanguage, coachEnabled })
    setMessage("Settings saved.")
  }

  return (
    <Card id="settings">
      <CardHeader>
        <CardTitle>Language settings</CardTitle>
        <CardDescription>Choose your language pair and whether coaching should run in new Codex tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="settings-fields">
            <Field>
              <FieldLabel htmlFor="native-language">Native language</FieldLabel>
              <Input id="native-language" value={nativeLanguage} onChange={(event) => setNativeLanguage(event.target.value)} required minLength={2} />
            </Field>
            <Field>
              <FieldLabel htmlFor="target-language">Target language</FieldLabel>
              <Input id="target-language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} required minLength={2} />
            </Field>
          </FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Coach new messages</FieldTitle>
              <FieldDescription>Review language before Codex handles the task. Only useful lessons are saved.</FieldDescription>
            </FieldContent>
            <Switch checked={coachEnabled} onCheckedChange={setCoachEnabled} aria-label="Enable language coaching" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
            <span className="text-sm text-muted-foreground" role="status">{message}</span>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function App() {
  const [data, setData] = useState<DashboardData>()
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      setError("")
      setData(await fetchJson<DashboardData>("/api/dashboard"))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The dashboard could not be loaded.")
    }
  }

  useEffect(() => { void load() }, [])
  const topCategory = useMemo(() => data?.progress.categoryCounts[0], [data])

  async function saveProfile(profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) {
    setSaving(true)
    try {
      const updated = await fetchJson<LanguageProfile>("/api/profile", { method: "PUT", body: JSON.stringify(profile) })
      setData((current) => current ? { ...current, profile: updated } : current)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id: string) {
    await fetchJson(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" })
    await load()
  }

  if (!data && !error) return <LoadingDashboard />
  if (!data) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Dashboard unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader>
          <CardContent><Button onClick={() => void load()}>Try again</Button></CardContent>
        </Card>
      </main>
    )
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar data={data} />
        <SidebarInset>
          <header className="dashboard-header">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <div>
                <h1 className="text-sm font-semibold">Learning dashboard</h1>
                <p className="text-xs text-muted-foreground">Private · stored locally</p>
              </div>
            </div>
            <Badge variant={data.profile.coachEnabled ? "secondary" : "outline"}>
              <span className={`status-dot ${data.profile.coachEnabled ? "is-active" : ""}`} aria-hidden="true" />
              {data.profile.coachEnabled ? "Coaching on" : "Coaching paused"}
            </Badge>
          </header>

          <div className="dashboard-content" id="overview">
            <section className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{data.profile.nativeLanguage} → {data.profile.targetLanguage}</p>
              <h2 className="text-2xl font-semibold tracking-tight">Your learning activity</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">Track meaningful corrections, language choice, recurring patterns, and the lessons worth reviewing.</p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Learning summary">
              <MetricCard label="Learning notes" value={data.progress.totalNotes} detail={`${data.progress.notesThisWeek} saved this week`} icon={BookOpenCheckIcon} />
              <MetricCard label="Current streak" value={`${data.progress.currentStreak}d`} detail={`${data.progress.activeDays} active days overall`} icon={FlameIcon} />
              <MetricCard label="Target-language share" value={`${data.progress.languageUse.targetShare}%`} detail={`${data.progress.languageUse.target} target-language notes`} icon={TargetIcon} />
              <MetricCard label="Top correction" value={topCategory?.category ?? "—"} detail={topCategory ? `${topCategory.count} corrections recorded` : "No corrections recorded"} icon={SparklesIcon} />
            </section>

            <section className="analytics-grid" id="activity">
              <Card className="analytics-card activity-panel">
                <CardHeader><CardTitle>Weekly activity</CardTitle><CardDescription>Useful language notes saved during the last seven days.</CardDescription></CardHeader>
                <CardContent><ActivityChart activity={data.progress.weeklyActivity} /></CardContent>
              </Card>
              <Card className="analytics-card language-panel">
                <CardHeader><CardTitle>Language use</CardTitle><CardDescription>Language choice among messages that became learning notes.</CardDescription></CardHeader>
                <CardContent>
                  <LanguageUseChart data={data} />
                  <div className="language-legend">
                    {[
                      [data.profile.targetLanguage, data.progress.languageUse.target, "chart-1"],
                      [data.profile.nativeLanguage, data.progress.languageUse.native, "chart-2"],
                      ["Mixed", data.progress.languageUse.mixed, "chart-3"],
                      ["Other", data.progress.languageUse.other, "chart-4"],
                    ].map(([label, value, color]) => (
                      <div key={String(label)}><span className="legend-dot" style={{ background: `var(--${color})` }} /><span>{label}</span><strong>{value}</strong></div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="analytics-card category-panel">
                <CardHeader><CardTitle>Correction mix</CardTitle><CardDescription>Where your saved lessons are concentrated.</CardDescription></CardHeader>
                <CardContent><CategoryChart categories={data.progress.categoryCounts} /></CardContent>
              </Card>
              <Card className="analytics-card pattern-panel">
                <CardHeader><CardTitle>Recurring patterns</CardTitle><CardDescription>Structures and phrases that have appeared more than once.</CardDescription></CardHeader>
                <CardContent><PatternRanking patterns={data.progress.recurringPatterns} /></CardContent>
              </Card>
            </section>

            <section className="flashcard-section" id="flashcards">
              <div className="flashcard-section-header">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">English note flashcards</h2>
                  <p className="text-sm text-muted-foreground">Recall the natural phrasing first, then reveal the lesson.</p>
                </div>
              </div>
              {data.notes.length ? (
                <FlashcardDeck notes={data.notes} onDelete={deleteNote} />
              ) : (
                <Card><CardHeader><CardTitle>No flashcards yet</CardTitle><CardDescription>Cards appear only when a message contains a meaningful correction or reusable pattern.</CardDescription></CardHeader></Card>
              )}
            </section>

            <SettingsCard profile={data.profile} saving={saving} onSave={saveProfile} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
