import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { DashboardData, LanguageProfile, LearningNote } from "@language-coach/core"
import { ActivityIcon, ArrowLeftIcon, BookOpenCheckIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon, LanguagesIcon, Settings2Icon, SparklesIcon, TargetIcon } from "lucide-react"

import { ActivityChart, CategoryChart, LanguageUseChart } from "@/components/analytics-charts"
import { NoteFlashcard } from "@/components/note-flashcard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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
    <div className="min-h-svh" aria-busy="true" aria-label="Loading dashboard">
      <header className="dashboard-header"><Skeleton className="h-9 w-44" /><Skeleton className="h-9 w-24" /></header>
      <main className="dashboard-content dashboard-content--focused">
        <Skeleton className="h-16 w-72 max-w-full" />
        <Skeleton className="h-96 w-full" />
      </main>
    </div>
  )
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Language Coach home">
      <span className="brand-mark"><LanguagesIcon /></span>
      <span className="brand-name">Language Coach</span>
    </a>
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

function DashboardHeader({ settingsPage = false }: { settingsPage?: boolean }) {
  return (
    <header className="dashboard-header">
      <Brand />
      <Button variant="ghost" asChild>
        <a href={settingsPage ? "/" : "/settings"}>
          {settingsPage ? <ArrowLeftIcon data-icon="inline-start" /> : <Settings2Icon data-icon="inline-start" />}
          {settingsPage ? "Back to notes" : "Settings"}
        </a>
      </Button>
    </header>
  )
}

function NotesPage({ data, onDelete }: { data: DashboardData; onDelete: (id: string) => Promise<void> }) {
  return (
    <div className="min-h-svh">
      <DashboardHeader />
      <main className="dashboard-content dashboard-content--focused" id="main-content">
        <section className="notes-intro">
          <div>
            <p className="notes-eyebrow">{data.profile.nativeLanguage} → {data.profile.targetLanguage}</p>
            <h1>Your language notes</h1>
            <p>Recall the natural phrasing, then reveal the lesson.</p>
          </div>
          <span className="note-count" aria-label={`${data.notes.length} learning notes`}>
            <strong>{data.notes.length}</strong>
            <span>{data.notes.length === 1 ? "note" : "notes"}</span>
          </span>
        </section>

        <section className="flashcard-section" aria-label="English note flashcards">
          {data.notes.length ? (
            <FlashcardDeck notes={data.notes} onDelete={onDelete} />
          ) : (
            <Card className="empty-notes">
              <CardHeader>
                <CardTitle>No notes yet</CardTitle>
                <CardDescription>Useful corrections and reusable language patterns will appear here as flashcards.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}

function SettingsPage({ data, saving, onSave }: {
  data: DashboardData
  saving: boolean
  onSave: (profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) => Promise<void>
}) {
  const topCategory = data.progress.categoryCounts[0]

  return (
    <div className="min-h-svh">
      <DashboardHeader settingsPage />
      <main className="dashboard-content settings-page" id="main-content">
        <section className="settings-intro">
          <p className="notes-eyebrow">Settings &amp; activity</p>
          <h1>Learning overview</h1>
          <p>Review your progress and manage how Language Coach works.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Learning summary">
          <MetricCard label="Learning notes" value={data.progress.totalNotes} detail={`${data.progress.notesThisWeek} saved this week`} icon={BookOpenCheckIcon} />
          <MetricCard label="Current streak" value={`${data.progress.currentStreak}d`} detail={`${data.progress.activeDays} active days overall`} icon={FlameIcon} />
          <MetricCard label="Target-language share" value={`${data.progress.languageUse.targetShare}%`} detail={`${data.progress.languageUse.target} target-language notes`} icon={TargetIcon} />
          <MetricCard label="Top correction" value={topCategory?.category ?? "—"} detail={topCategory ? `${topCategory.count} corrections recorded` : "No corrections recorded"} icon={SparklesIcon} />
        </section>

        <section className="analytics-grid" aria-label="Learning activity">
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

        <SettingsCard profile={data.profile} saving={saving} onSave={onSave} />
      </main>
    </div>
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

  const settingsPage = window.location.pathname === "/settings" || window.location.pathname.startsWith("/settings/")

  return (
    <TooltipProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {settingsPage
        ? <SettingsPage data={data} saving={saving} onSave={saveProfile} />
        : <NotesPage data={data} onDelete={deleteNote} />}
    </TooltipProvider>
  )
}
