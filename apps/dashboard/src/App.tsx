import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { DashboardData, DashboardRuntimeConfig, LanguageProfile, LearningNote, SyncStatus } from "@language-coach/core"
import { ActivityIcon, ArrowLeftIcon, BookOpenCheckIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloudIcon, FlameIcon, LanguagesIcon, LaptopIcon, LogInIcon, Settings2Icon, SparklesIcon, TargetIcon } from "lucide-react"
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom"

import { AuthPage } from "@/AuthPage"
import { initializeAuth, readAuthSession, type AuthClient, type AuthUser } from "@/auth-client"
import { ActivityChart, CategoryChart, LanguageUseChart } from "@/components/analytics-charts"
import { LandingPage } from "@/LandingPage"
import { LegalPage } from "@/LegalPage"
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
import { createDashboardApi, type DashboardApi, UnauthorizedError } from "@/dashboard-api"

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

function FlashcardDeck({ notes, hasMore, loadingMore, onLoadMore, onDelete }: {
  notes: LearningNote[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
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
      {hasMore && (
        <Button variant="outline" className="self-center" disabled={loadingMore} onClick={() => void onLoadMore()}>
          {loadingMore ? "Loading notes…" : "Load more notes"}
        </Button>
      )}
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

function AccountSyncCard({ mode, sync, user, changing, onToggle, onSignOut }: {
  mode: "local" | "remote"
  sync?: SyncStatus
  user?: AuthUser
  changing: boolean
  onToggle: (enabled: boolean) => Promise<void>
  onSignOut: () => Promise<void>
}) {
  const enabled = mode === "remote" || Boolean(sync?.enabled)
  const statusTitle = changing
    ? "Updating storage…"
    : sync?.state === "syncing"
      ? "Uploading notes…"
    : enabled
      ? "Cloud upload is on"
      : "Stored on this computer"
  const statusDescription = sync?.state === "syncing"
    ? `${sync.completedItems ?? 0} of ${sync.totalItems ?? 0} local items uploaded from this device.`
    : enabled
    ? user?.email
      ? `Signed in as ${user.email}. This device uploads notes to your private account.`
      : "This device uploads notes to your private account. Remote notes are never downloaded here."
    : user
      ? `You are signed in as ${user.email}, but these notes have not been uploaded.`
      : "Only this computer can access these notes. Nothing is uploaded."

  return (
    <Card id="account-sync">
      <CardHeader>
        <CardTitle>{mode === "remote" ? "Account & notes" : "Where should your notes be saved?"}</CardTitle>
        <CardDescription>
          {mode === "remote"
            ? "This web dashboard shows the notes saved to your private account."
            : "Keep notes only on this computer, or upload a copy to your private account."}
        </CardDescription>
      </CardHeader>
      <CardContent className="sync-card-content">
        {mode === "local" && (
          <div className="sync-storage-options" role="radiogroup" aria-label="Where to save learning notes">
            <button
              type="button"
              role="radio"
              aria-checked={!enabled}
              data-active={!enabled}
              disabled={changing}
              onClick={() => { if (enabled) void onToggle(false) }}
            >
              <span className="sync-option-icon"><LaptopIcon /></span>
              <span className="sync-option-copy"><strong>Local only</strong><span>Keep notes on this computer</span></span>
              <span className="sync-option-check" aria-hidden="true"><CheckIcon /></span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={enabled}
              data-active={enabled}
              disabled={changing}
              onClick={() => { if (!enabled) void onToggle(true) }}
            >
              <span className="sync-option-icon"><CloudIcon /></span>
              <span className="sync-option-copy"><strong>Upload to your account</strong><span>Combine this device's notes on the web</span></span>
              <span className="sync-option-check" aria-hidden="true"><CheckIcon /></span>
            </button>
          </div>
        )}

        <div className="sync-current-status" data-enabled={enabled} aria-live="polite">
          <span className="sync-status-dot" aria-hidden="true" />
          <div>
            <strong>{statusTitle}</strong>
            <p>{statusDescription}</p>
            {sync?.state === "syncing" && (
              <div className="sync-upload-progress" role="progressbar" aria-label="Note upload progress" aria-valuemin={0}
                aria-valuemax={sync.totalItems || 1} aria-valuenow={sync.completedItems || 0}>
                <span style={{ width: `${sync.totalItems ? ((sync.completedItems || 0) / sync.totalItems) * 100 : 0}%` }} />
              </div>
            )}
            {sync?.lastSyncedAt && <time dateTime={sync.lastSyncedAt}>Last synced {new Date(sync.lastSyncedAt).toLocaleString()}.</time>}
          </div>
        </div>

        {sync?.error && <p className="sync-error" role="alert">{sync.error}</p>}

        {user && (
          <div className="sync-account-row">
            <span>Account: <strong>{user.email}</strong></span>
            <Button variant="outline" size="sm" onClick={() => void onSignOut()}><LogInIcon /> Sign out</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardHeader({ settingsPage = false }: { settingsPage?: boolean }) {
  return (
    <header className="dashboard-header">
      <Brand />
      <Button variant="ghost" asChild>
        <a href={settingsPage ? "/dashboard" : "/dashboard/settings"}>
          {settingsPage ? <ArrowLeftIcon data-icon="inline-start" /> : <Settings2Icon data-icon="inline-start" />}
          {settingsPage ? "Back to notes" : "Settings"}
        </a>
      </Button>
    </header>
  )
}

function NotesPage({ data, loadingMore, onLoadMore, onDelete }: {
  data: DashboardData
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
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
          <span className="note-count" aria-label={`${data.progress.totalNotes} learning notes`}>
            <strong>{data.progress.totalNotes}</strong>
            <span>{data.progress.totalNotes === 1 ? "note" : "notes"}</span>
          </span>
        </section>

        <section className="flashcard-section" aria-label="English note flashcards">
          {data.notes.length ? (
            <FlashcardDeck notes={data.notes} hasMore={Boolean(data.notesPage?.hasMore)} loadingMore={loadingMore}
              onLoadMore={onLoadMore} onDelete={onDelete} />
          ) : (
            <Card className="empty-notes">
              <CardHeader>
                <CardTitle>No notes yet</CardTitle>
                <CardDescription>Useful corrections and reusable language patterns will appear here as flashcards.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </section>

        <section className="recurring-patterns-section" aria-labelledby="recurring-patterns-title">
          <Card>
            <CardHeader>
              <CardTitle id="recurring-patterns-title">Recurring patterns</CardTitle>
              <CardDescription>Structures and phrases that have appeared more than once.</CardDescription>
            </CardHeader>
            <CardContent><PatternRanking patterns={data.progress.recurringPatterns} /></CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

function SettingsPage({ data, saving, onSave, mode, user, syncChanging, onSyncToggle, onSignOut }: {
  data: DashboardData
  saving: boolean
  onSave: (profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) => Promise<void>
  mode: "local" | "remote"
  user?: AuthUser
  syncChanging: boolean
  onSyncToggle: (enabled: boolean) => Promise<void>
  onSignOut: () => Promise<void>
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
        </section>

        <AccountSyncCard mode={mode} sync={data.sync} user={user} changing={syncChanging} onToggle={onSyncToggle} onSignOut={onSignOut} />
        <SettingsCard profile={data.profile} saving={saving} onSave={onSave} />
      </main>
    </div>
  )
}

export function DashboardApp() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData>()
  const [runtime, setRuntime] = useState<DashboardRuntimeConfig>()
  const [auth, setAuth] = useState<AuthClient>()
  const [user, setUser] = useState<AuthUser>()
  const [accessToken, setAccessToken] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [syncChanging, setSyncChanging] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const api = useMemo(() => runtime ? createDashboardApi(runtime, accessToken || undefined) : undefined, [accessToken, runtime])

  async function load(client = api) {
    if (!client) return
    try {
      setError("")
      setData(await client.getDashboard())
    } catch (loadError) {
      if (loadError instanceof UnauthorizedError) {
        setAuthRequired(true)
        setData(undefined)
        return
      }
      setError(loadError instanceof Error ? loadError.message : "The dashboard could not be loaded.")
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const { runtime: nextRuntime, auth: nextAuth } = await initializeAuth()
        setRuntime(nextRuntime)
        setAuth(nextAuth)

        const session = nextAuth ? await readAuthSession(nextAuth) : undefined
        if (session) {
          setAccessToken(session.token)
          setUser(session.user)
          await load(createDashboardApi(nextRuntime, session.token))
        } else if (nextRuntime.mode === "remote") {
          setAuthRequired(true)
        } else {
          await load(createDashboardApi(nextRuntime))
        }
      } catch (initializeError) {
        setError(initializeError instanceof Error ? initializeError.message : "The dashboard could not be initialized.")
      }
    })()
  }, [])

  useEffect(() => {
    if (!api || data?.sync?.state !== "syncing") return
    const timer = window.setTimeout(() => { void load(api) }, 750)
    return () => window.clearTimeout(timer)
  }, [api, data?.sync?.state, data?.sync?.completedItems])

  function setSyncError(message: string) {
    setData((current) => current ? {
      ...current,
      sync: { enabled: Boolean(current.sync?.enabled), ...current.sync, error: message },
    } : current)
  }

  async function enableSync(client: DashboardApi, token: string, nextUser: AuthUser) {
    await client.enableLocalSync(token)
    setUser(nextUser)
    await load(client)
  }

  async function disableSync(client: DashboardApi, token: string) {
    await client.disableLocalSync(token)
    await load(client)
  }

  async function toggleSync(enabled: boolean) {
    if (!api) return
    if (!auth || !accessToken || !user) {
      const intent = enabled ? "sync" : "disable"
      navigate(`/sign-in?intent=${intent}&returnTo=${encodeURIComponent("/dashboard/settings")}`)
      return
    }
    setSyncChanging(true)
    try {
      if (enabled) await enableSync(api, accessToken, user)
      else await disableSync(api, accessToken)
    } catch (actionError) {
      setSyncError(actionError instanceof Error ? actionError.message : "The sync setting could not be changed.")
    } finally {
      setSyncChanging(false)
    }
  }

  async function signOut() {
    await auth?.adapter.signOut()
    setAccessToken("")
    setUser(undefined)
    if (runtime?.mode === "remote") {
      setData(undefined)
      navigate("/sign-in", { replace: true })
    }
  }

  async function saveProfile(profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) {
    if (!api) return
    setSaving(true)
    try {
      const updated = await api.updateProfile(profile)
      setData((current) => current ? { ...current, profile: updated } : current)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id: string) {
    if (!api) return
    await api.deleteNote(id)
    await load()
  }

  async function loadMoreNotes() {
    const cursor = data?.notesPage?.nextCursor
    if (!api || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await api.getDashboard(cursor)
      setData((current) => {
        if (!current) return next
        const notes = new Map(current.notes.map((note) => [note.id, note]))
        for (const note of next.notes) notes.set(note.id, note)
        return { ...current, notes: [...notes.values()], notesPage: next.notesPage, progress: next.progress }
      })
    } finally {
      setLoadingMore(false)
    }
  }

  if (authRequired) return <Navigate to="/sign-in?returnTo=%2Fdashboard" replace />
  if ((!data && !error) || !runtime) return <LoadingDashboard />
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

  const settingsPage = window.location.pathname === "/dashboard/settings" || window.location.pathname.startsWith("/dashboard/settings/")

  return (
    <TooltipProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {settingsPage
        ? <SettingsPage data={data} saving={saving} onSave={saveProfile} mode={runtime.mode} user={user} syncChanging={syncChanging} onSyncToggle={toggleSync} onSignOut={signOut} />
        : <NotesPage data={data} loadingMore={loadingMore} onLoadMore={loadMoreNotes} onDelete={deleteNote} />}
    </TooltipProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
        <Route path="/privacy-policy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/dashboard/*" element={<DashboardApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
