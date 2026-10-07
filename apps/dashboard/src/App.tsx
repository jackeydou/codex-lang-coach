import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from "react"
import type { DashboardData, DashboardRuntimeConfig, LanguageProfile, SyncStatus, DashboardNote, NotesOrder, MarkReviewedInput } from "@language-coach/core"
import { ActivityIcon, ArrowLeftIcon, ArrowRightIcon, BookOpenCheckIcon, CheckIcon, ChevronRightIcon, CloudIcon, FlameIcon, LayersIcon, LaptopIcon, LightbulbIcon, LogInIcon, Repeat2Icon, Settings2Icon, SparklesIcon, TargetIcon } from "lucide-react"
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"

import { AuthPage } from "@/AuthPage"
import { initializeAuth, readAuthSession, type AuthClient, type AuthUser } from "@/auth-client"
import { ActivityChart, CategoryChart, LanguageUseChart } from "@/components/analytics-charts"
import { LandingPage } from "@/LandingPage"
import { LegalPage } from "@/LegalPage"
import { NoteFlashcard } from "@/components/note-flashcard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDashboardApi, type DashboardApi, type LearningDashboardClient, loadDashboardRuntime, UnauthorizedError } from "@/dashboard-api"
import { ReviewError } from "@language-coach/core/review"
import { applyReview, mergeNotes, preserveReviews } from "@/review-state"
import { useDashboardStatusPolling } from "@/hooks/use-dashboard-status-polling"
import { resolveDashboardRoute, type DashboardPage } from "@/dashboard-route"

function LoadingDashboard() {
  return (
    <div className="dashboard-loading" aria-busy="true" aria-label="Loading dashboard">
      <aside><Skeleton className="h-9 w-40" /><Skeleton className="mt-10 h-8 w-full" /><Skeleton className="mt-2 h-8 w-full" /></aside>
      <main>
        <Skeleton className="h-full w-full rounded-2xl" />
      </main>
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof ActivityIcon }) {
  return (
    <div className="activity-metric">
      <Icon className="metric-icon" aria-hidden="true" />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

function ActivityHeatmap({ activity }: { activity: DashboardData["progress"]["activity90Days"] }) {
  const maximum = Math.max(1, ...activity.map((day) => day.count))
  const leadingDays = activity[0]
    ? new Date(`${activity[0].date}T00:00:00Z`).getUTCDay()
    : 0

  return (
    <section className="insight-section" aria-labelledby="activity-heatmap-title">
      <div className="insight-heading">
        <div>
          <h2 id="activity-heatmap-title">Practice activity</h2>
          <p>Last 90 days</p>
        </div>
        <span>{activity.reduce((total, day) => total + day.count, 0)} notes</span>
      </div>
      <div className="activity-heatmap" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil((leadingDays + activity.length) / 7))}, minmax(0, 1fr))` }} role="img" aria-label="Learning notes submitted during the last 90 days">
        {Array.from({ length: leadingDays }, (_, index) => <span key={`empty-${index}`} className="heatmap-cell heatmap-cell--empty" />)}
        {activity.map((day) => {
          const level = day.count === 0 ? 0 : Math.max(1, Math.ceil((day.count / maximum) * 4))
          return <span key={day.date} className="heatmap-cell" data-level={level} title={`${day.date}: ${day.count} ${day.count === 1 ? "note" : "notes"}`} />
        })}
      </div>
      <div className="heatmap-legend" aria-hidden="true"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}<span>More</span></div>
    </section>
  )
}

function RepeatPatterns({ patterns }: { patterns: DashboardData["progress"]["recurringPatterns"] }) {
  const pageSize = 4
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(patterns.length / pageSize))

  useEffect(() => setPage((current) => Math.min(current, pageCount - 1)), [pageCount])

  const visiblePatterns = patterns.slice(page * pageSize, (page + 1) * pageSize)
  return (
    <section className="repeat-patterns" aria-label="Repeated expressions">
      <div className="pattern-list-heading" aria-hidden="true"><span>Pattern</span><span>Meaning</span><span>Seen</span><span /></div>
      {visiblePatterns.length ? (
        <ol>
          {visiblePatterns.map((pattern) => (
            <li key={pattern.pattern}>
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="pattern-row" aria-label={`Open pattern: ${pattern.pattern}`}>
                    <span className="pattern-name"><LightbulbIcon aria-hidden="true" /><strong>{pattern.pattern}</strong></span>
                    <span className="pattern-meaning">{pattern.explanation}</span>
                    <span className="pattern-frequency">{pattern.count}×</span>
                    <ChevronRightIcon aria-hidden="true" />
                  </button>
                </DialogTrigger>
                <DialogContent className="pattern-dialog">
                  <DialogHeader>
                    <p className="pattern-dialog-eyebrow">Repeated {pattern.count} times</p>
                    <DialogTitle>{pattern.pattern}</DialogTitle>
                  </DialogHeader>
                  <DialogDescription>{pattern.explanation}</DialogDescription>
                </DialogContent>
              </Dialog>
            </li>
          ))}
        </ol>
      ) : <p className="patterns-empty">Patterns will appear as you save more lessons.</p>}
      {pageCount > 1 && (
        <nav className="patterns-pagination" aria-label="Repeat patterns pages">
          <Button variant="ghost" size="icon-sm" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Previous pattern page"><ArrowLeftIcon /></Button>
          <span>{page + 1} / {pageCount}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page === pageCount - 1} aria-label="Next pattern page"><ArrowRightIcon /></Button>
        </nav>
      )}
    </section>
  )
}

function FlashcardDeck({ notes, totalNotes, hasMore, loadingMore, onLoadMore, onDelete, onReview }: {
  notes: DashboardNote[]
  totalNotes: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReview?: (id: string) => Promise<void>
}) {
  const [activeNoteId, setActiveNoteId] = useState<string>()
  const previousPage = useRef(0)
  const selectedIndex = notes.findIndex((note) => note.id === activeNoteId)
  const page = selectedIndex >= 0 ? selectedIndex : Math.min(previousPage.current, Math.max(0, notes.length - 1))
  useEffect(() => {
    previousPage.current = page
    if (notes[page]?.id !== activeNoteId) setActiveNoteId(notes[page]?.id)
  }, [notes, page, activeNoteId])
  const [direction, setDirection] = useState<"up" | "down">("up")
  const [outgoingNote, setOutgoingNote] = useState<DashboardNote>()
  const pointerStart = useRef<number | undefined>(undefined)
  const touchStart = useRef<{ y: number; atTop: boolean; atBottom: boolean } | undefined>(undefined)
  const wheelDistance = useRef(0)
  const wheelGestureActive = useRef(false)
  const wheelStartedAtBoundary = useRef(false)
  const wheelSwitchedCard = useRef(false)
  const wheelGestureEndTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (page >= notes.length - 2 && hasMore && !loadingMore) void onLoadMore()
  }, [hasMore, loadingMore, notes.length, onLoadMore, page])

  useEffect(() => () => {
    if (wheelGestureEndTimer.current !== undefined) window.clearTimeout(wheelGestureEndTimer.current)
  }, [])

  useEffect(() => {
    function handleGlobalKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return

      const forward = ["ArrowRight", "ArrowDown", "PageDown", "j", "J"].includes(event.key)
      const backward = ["ArrowLeft", "ArrowUp", "PageUp", "k", "K"].includes(event.key)
      if (!forward && !backward) return

      const nextPage = Math.max(0, Math.min(notes.length - 1, page + (forward ? 1 : -1)))
      event.preventDefault()
      if (nextPage === page || !notes[page]) return

      setDirection(forward ? "up" : "down")
      setOutgoingNote(notes[page])
      setActiveNoteId(notes[nextPage]?.id)
    }

    window.addEventListener("keydown", handleGlobalKeyboard)
    return () => window.removeEventListener("keydown", handleGlobalKeyboard)
  }, [notes, outgoingNote, page])

  if (!notes.length) return null

  const activeNote = notes[page]
  if (!activeNote) return null
  function goTo(nextPage: number) {
    const clampedPage = Math.max(0, Math.min(notes.length - 1, nextPage))
    if (clampedPage === page) return
    setDirection(clampedPage > page ? "up" : "down")
    setOutgoingNote(activeNote)
    setActiveNoteId(notes[clampedPage]?.id)
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    const isNewGesture = !wheelGestureActive.current

    if (isNewGesture) {
      wheelDistance.current = 0
      wheelStartedAtBoundary.current = false
      wheelSwitchedCard.current = false
    }

    wheelGestureActive.current = true
    if (wheelGestureEndTimer.current !== undefined) window.clearTimeout(wheelGestureEndTimer.current)
    wheelGestureEndTimer.current = window.setTimeout(() => {
      wheelGestureActive.current = false
      wheelStartedAtBoundary.current = false
      wheelSwitchedCard.current = false
      wheelDistance.current = 0
    }, 300)

    // A trackpad keeps emitting momentum events after the card changes. Consume
    // the rest of that gesture so it cannot scroll or switch the new card.
    if (wheelSwitchedCard.current) {
      event.preventDefault()
      return
    }

    const scrollableCard = (event.target as HTMLElement).closest<HTMLElement>(".flashcard-scroll")
    let atBoundary = true
    let canScrollContent = false
    if (scrollableCard) {
      const atTop = scrollableCard.scrollTop <= 1
      const atBottom = scrollableCard.scrollTop + scrollableCard.clientHeight >= scrollableCard.scrollHeight - 1
      atBoundary = event.deltaY < 0 ? atTop : atBottom
      canScrollContent = !atBoundary
    }

    if (isNewGesture) wheelStartedAtBoundary.current = atBoundary

    if (canScrollContent) {
      wheelDistance.current = 0
      wheelStartedAtBoundary.current = false
      return
    }

    if (!wheelStartedAtBoundary.current) {
      event.preventDefault()
      return
    }

    const canMove = event.deltaY > 0 ? page < notes.length - 1 : page > 0
    if (!canMove) return
    event.preventDefault()
    wheelDistance.current += event.deltaY
    if (Math.abs(wheelDistance.current) < 36) return
    wheelSwitchedCard.current = true
    goTo(page + (wheelDistance.current > 0 ? 1 : -1))
    wheelDistance.current = 0
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || event.pointerType === "touch" || (event.target as HTMLElement).closest("button, a, input")) return
    pointerStart.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerStart.current === undefined) return
    const distance = event.clientY - pointerStart.current
    pointerStart.current = undefined
    if (Math.abs(distance) < 52) return
    goTo(page + (distance < 0 ? 1 : -1))
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, input")) return
    const scrollableCard = (event.target as HTMLElement).closest<HTMLElement>(".flashcard-scroll")
    touchStart.current = {
      y: event.touches[0]?.clientY ?? 0,
      atTop: !scrollableCard || scrollableCard.scrollTop <= 1,
      atBottom: !scrollableCard || scrollableCard.scrollTop + scrollableCard.clientHeight >= scrollableCard.scrollHeight - 1,
    }
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = undefined
    if (!start) return
    const distance = (event.changedTouches[0]?.clientY ?? start.y) - start.y
    if (distance < -52 && start.atBottom) goTo(page + 1)
    if (distance > 52 && start.atTop) goTo(page - 1)
  }

  return (
    <div className="flashcard-deck" aria-label="Language note viewer">
      <div className="flashcard-viewer">
        <div
          className="flashcard-deck-stage"
          role="group"
          aria-roledescription="card viewer"
          aria-label={`Card ${page + 1} of ${totalNotes}. Swipe, scroll, or use arrow keys to change cards.`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStart.current = undefined }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { touchStart.current = undefined }}
        >
          {outgoingNote && (
            <div key={outgoingNote.id} className="deck-outgoing-card" data-direction={direction} aria-hidden="true"
              onAnimationEnd={(event) => { if (event.currentTarget === event.target) setOutgoingNote(undefined) }}>
              <NoteFlashcard note={outgoingNote} onDelete={onDelete} />
            </div>
          )}
          <div key={activeNote.id} className="deck-active-card" data-direction={direction}>
            <NoteFlashcard note={activeNote} onDelete={onDelete} onReview={onReview} />
          </div>
        </div>

        <nav className="flashcard-controls" aria-label="Card navigation">
          <Button variant="outline" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Previous card">
            <ArrowLeftIcon /> Previous
          </Button>
          <span className="flashcard-deck-status" aria-live="polite">
            {String(page + 1).padStart(2, "0")} / {totalNotes}
          </span>
          <Button onClick={() => goTo(page + 1)} disabled={page === notes.length - 1} aria-label="Next card">
            Next <ArrowRightIcon />
          </Button>
        </nav>
      </div>
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
    try {
      await onSave({ nativeLanguage, targetLanguage, coachEnabled })
      setMessage("Settings saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.")
    }
  }

  return (
    <Card id="settings" className="settings-editorial-card">
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
    <Card id="account-sync" className="settings-editorial-card">
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

        {user ? (
          <div className="sync-account-row">
            <span>Account: <strong>{user.email}</strong></span>
            <Button variant="outline" size="sm" onClick={() => void onSignOut()}><LogInIcon /> Sign out</Button>
          </div>
        ) : mode === "local" && (
          <div className="sync-account-row">
            <Button asChild variant="outline" size="sm">
              <Link to="/sign-in?returnTo=%2Fdashboard%2Fsettings"><LogInIcon /> Sign in</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardSidebarNavigation({ page, footer = false }: { page: DashboardPage; footer?: boolean }) {
  const { setOpenMobile } = useSidebar()
  const destinations = [
    { page: "flashcards", label: "Flash cards", to: "/dashboard", icon: LayersIcon },
    { page: "patterns", label: "Repeat patterns", to: "/dashboard/patterns", icon: Repeat2Icon },
    { page: "activity", label: "Activity", to: "/dashboard/activity", icon: ActivityIcon },
    { page: "settings", label: "Settings", to: "/dashboard/settings", icon: Settings2Icon },
  ] as const

  return (
    <SidebarMenu>
      {destinations.filter((destination) => footer ? destination.page === "settings" : destination.page !== "settings").map(({ page: destination, label, to, icon: Icon }) => (
        <SidebarMenuItem key={destination}>
          <SidebarMenuButton asChild isActive={page === destination} tooltip={label}>
            <Link to={to} aria-current={page === destination ? "page" : undefined} onClick={() => setOpenMobile(false)}><Icon /><span>{label}</span></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function DashboardShell({ page, user, children }: { page: DashboardPage; user?: AuthUser; children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <SidebarProvider className="dashboard-workspace" style={{ "--sidebar-width": "13rem" } as React.CSSProperties}>
      <Sidebar collapsible="icon" className="dashboard-sidebar">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent><DashboardSidebarNavigation page={page} /></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <DashboardSidebarNavigation page={page} footer />
          {user && <div className="dashboard-sidebar-profile"><span>Signed in</span><strong>{user.email}</strong></div>}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="dashboard-shell-main">
        <div className="dashboard-sidebar-toggle"><SidebarTrigger /></div>
        <div className="dashboard-page-container" key={pathname}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function PageHeader({ title, description, count }: { title: string; description?: string; count?: string }) {
  return (
    <header className="dashboard-page-header">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {count && <span className="dashboard-page-count">{count}</span>}
    </header>
  )
}

export function FlashcardsPage({ data, loadingMore, onLoadMore, onDelete, onReview, order = "review", onOrderChange, onRefresh, refreshing = false }: {
  data: DashboardData
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReview?: (id: string) => Promise<void>
  order?: NotesOrder
  onOrderChange?: (order: NotesOrder) => void
  onRefresh?: () => void
  refreshing?: boolean
}) {
  return (
    <div className="dashboard-page flashcards-page" id="main-content" tabIndex={-1}>
      <PageHeader title="Flash cards" count={`${data.progress.totalNotes} notes`} />
      <section className="flashcard-section" aria-label="Language note flashcards">
        {data.capabilities?.reviewScheduling && (
          <div className="review-toolbar">
            <div>
              <label className="sr-only" htmlFor="notes-order">Card order</label>
              <select id="notes-order" value={order} onChange={(event) => onOrderChange?.(event.target.value as NotesOrder)} disabled={refreshing || !onOrderChange}>
                <option value="review">Review first</option>
                <option value="recent">Latest notes</option>
              </select>
              <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing || !onRefresh}>{refreshing ? "Refreshing…" : "Refresh order"}</Button>
            </div>
            {data.reviewSummary && <p aria-live="polite">{data.reviewSummary.due + data.reviewSummary.new === 0
              ? "All reviews in this round are complete."
              : `${data.reviewSummary.due} due · ${data.reviewSummary.new} not studied`}</p>}
          </div>
        )}
        {data.notes.length ? (
          <FlashcardDeck notes={data.notes} totalNotes={data.reviewSummary
            ? data.reviewSummary.due + data.reviewSummary.new + data.reviewSummary.scheduled : data.progress.totalNotes}
            hasMore={Boolean(data.notesPage?.hasMore)} loadingMore={loadingMore}
            onLoadMore={onLoadMore} onDelete={onDelete} onReview={onReview} />
        ) : (
          <Card className="empty-notes">
            <CardHeader><CardTitle>No notes yet</CardTitle><CardDescription>Useful corrections and reusable language patterns will appear here as flashcards.</CardDescription></CardHeader>
          </Card>
        )}
      </section>
    </div>
  )
}

export function PatternsPage({ data }: { data: DashboardData }) {
  return (
    <div className="dashboard-page patterns-page" id="main-content" tabIndex={-1}>
      <PageHeader title="Repeat patterns" description="Expressions worth using again." count={`${data.progress.recurringPatterns.length} patterns`} />
      <RepeatPatterns patterns={data.progress.recurringPatterns} />
    </div>
  )
}

export function ActivityPage({ data }: { data: DashboardData }) {
  const topCategory = data.progress.categoryCounts[0]
  return (
    <div className="dashboard-page activity-page" id="main-content" tabIndex={-1}>
      <PageHeader title="Activity" description="Your learning at a glance." />
      <section className="activity-metrics" aria-label="Learning summary">
        <MetricCard label="Learning notes" value={data.progress.totalNotes} detail={`${data.progress.notesThisWeek} saved this week`} icon={BookOpenCheckIcon} />
        <MetricCard label="Current streak" value={`${data.progress.currentStreak}d`} detail={`${data.progress.activeDays} active days overall`} icon={FlameIcon} />
        <MetricCard label="Target-language share" value={`${data.progress.languageUse.targetShare}%`} detail={`${data.progress.languageUse.target} target-language notes`} icon={TargetIcon} />
        <MetricCard label="Top correction" value={topCategory?.category ?? "—"} detail={topCategory ? `${topCategory.count} corrections recorded` : "No corrections recorded"} icon={SparklesIcon} />
      </section>
      <ActivityHeatmap activity={data.progress.activity90Days} />
      <section className="analytics-grid" aria-label="Learning activity">
        <Card className="analytics-card activity-panel">
          <CardHeader><CardTitle>Weekly activity</CardTitle><CardDescription>Useful notes saved in the last seven days.</CardDescription></CardHeader>
          <CardContent><ActivityChart activity={data.progress.weeklyActivity} /></CardContent>
        </Card>
        <Card className="analytics-card language-panel">
          <CardHeader><CardTitle>Language use</CardTitle><CardDescription>Language choice among saved lessons.</CardDescription></CardHeader>
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
    </div>
  )
}

export function SettingsPage({ data, saving, onSave, mode, user, syncChanging, onSyncToggle, onSignOut, openStandalone }: {
  data: DashboardData
  saving: boolean
  onSave: (profile: Pick<LanguageProfile, "nativeLanguage" | "targetLanguage" | "coachEnabled">) => Promise<void>
  mode: "local" | "remote"
  user?: AuthUser
  syncChanging: boolean
  onSyncToggle: (enabled: boolean) => Promise<void>
  onSignOut: () => Promise<void>
  openStandalone?: () => Promise<void>
}) {
  return (
    <div className="dashboard-page settings-page" id="main-content" tabIndex={-1}>
      <PageHeader title="Settings" description="Language and coaching preferences." />
      <div className="settings-sections">
        <SettingsCard profile={data.profile} saving={saving} onSave={onSave} />
        {openStandalone ? (
          <Card className="settings-editorial-card">
            <CardHeader><CardTitle>Login &amp; sync</CardTitle><CardDescription>{data.sync?.enabled ? "Cloud upload is on." : "Your notes are stored on this computer."} Manage your account in the web dashboard.</CardDescription></CardHeader>
            <CardContent><Button variant="outline" onClick={() => void onSyncToggle(Boolean(data.sync?.enabled))}>Open web dashboard</Button></CardContent>
          </Card>
        ) : <AccountSyncCard mode={mode} sync={data.sync} user={user} changing={syncChanging} onToggle={onSyncToggle} onSignOut={onSignOut} />}
      </div>
    </div>
  )
}

export function DashboardApp({ embedded }: { embedded?: { client: LearningDashboardClient; openStandalone: () => Promise<void> } }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { page, redirectTo } = resolveDashboardRoute(pathname)
  const settingsPage = page === "settings"
  const [data, setData] = useState<DashboardData>()
  const [runtime, setRuntime] = useState<DashboardRuntimeConfig | undefined>(embedded ? { mode: "local", remoteUrl: "" } : undefined)
  const [auth, setAuth] = useState<AuthClient>()
  const [user, setUser] = useState<AuthUser>()
  const [accessToken, setAccessToken] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [syncChanging, setSyncChanging] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [paginationFailed, setPaginationFailed] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [order, setOrder] = useState<NotesOrder>("review")
  const orderRef = useRef<NotesOrder>("review")
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(0)
  const reviewRequests = useRef(new Map<string, MarkReviewedInput>())
  const reviewInFlight = useRef(new Map<string, Promise<void>>())
  const webApi = useMemo(() => !embedded && runtime ? createDashboardApi(runtime, accessToken || undefined) : undefined, [accessToken, runtime, embedded])
  const api: LearningDashboardClient | undefined = embedded?.client || webApi

  async function load(client = api, nextOrder = orderRef.current) {
    if (!client) return
    const generation = ++generationRef.current
    loadingMoreRef.current = false
    setLoadingMore(false)
    setRefreshing(true)
    try {
      setError("")
      const next = await client.getDashboard(undefined, nextOrder)
      if (generation !== generationRef.current) return
      orderRef.current = next.capabilities?.reviewScheduling ? nextOrder : "recent"
      setOrder(orderRef.current)
      setPaginationFailed(false)
      setData((current) => preserveReviews(current, next))
    } catch (loadError) {
      if (generation !== generationRef.current) return
      if (loadError instanceof UnauthorizedError) {
        setAuthRequired(true)
        setData(undefined)
        return
      }
      setError(loadError instanceof Error ? loadError.message : "The dashboard could not be loaded.")
    } finally {
      if (generation === generationRef.current) setRefreshing(false)
    }
  }

  useEffect(() => {
    if (embedded) { void load(embedded.client); return }
    void (async () => {
      try {
        const { runtime: nextRuntime, auth: nextAuth } = await initializeAuth()
        setRuntime(nextRuntime)
        setAuth(nextAuth)

        if (nextRuntime.mode === "remote") {
          const session = nextAuth ? await readAuthSession(nextAuth) : undefined
          if (session) {
            setAccessToken(session.token)
            setUser(session.user)
            await load(createDashboardApi(nextRuntime, session.token))
          } else {
            setAuthRequired(true)
          }
        } else {
          await load(createDashboardApi(nextRuntime))
        }
      } catch (initializeError) {
        setError(initializeError instanceof Error ? initializeError.message : "The dashboard could not be initialized.")
      }
    })()
  }, [embedded])

  useEffect(() => {
    if (embedded || runtime?.mode !== "local" || (!settingsPage && !data?.sync?.enabled) || auth) return
    let active = true

    void (async () => {
      try {
        const initialized = await initializeAuth({ includeRemoteAuth: true })
        if (!active || !initialized.auth) return
        const session = await readAuthSession(initialized.auth)
        if (!active) return
        setRuntime(initialized.runtime)
        setAuth(initialized.auth)
        if (session) {
          setAccessToken(session.token)
          setUser(session.user)
        }
      } catch {
        // Remote account state must never make the local dashboard unavailable.
      }
    })()

    return () => { active = false }
  }, [auth, data?.sync?.enabled, runtime?.mode, settingsPage])

  useDashboardStatusPolling({
    client: api, embedded: Boolean(embedded), syncing: data?.sync?.state === "syncing",
    onStatus: (status) => setData((current) => current ? {
      ...current, progress: status.progress, sync: status.sync,
      profile: status.profile.updatedAt >= current.profile.updatedAt ? status.profile : current.profile,
    } : current),
    onError: (error) => setSyncError(error instanceof Error ? error.message : "Dashboard status could not be loaded."),
  })

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
    if (embedded) {
      try { await embedded.openStandalone() }
      catch (error) { setError(error instanceof Error ? error.message : "The web dashboard could not be opened.") }
      return
    }
    if (!webApi) return
    if (!auth || !accessToken || !user) {
      const intent = enabled ? "sync" : "disable"
      navigate(`/sign-in?intent=${intent}&returnTo=${encodeURIComponent("/dashboard/settings")}`)
      return
    }
    setSyncChanging(true)
    try {
      if (enabled) await enableSync(webApi, accessToken, user)
      else await disableSync(webApi, accessToken)
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

  async function markReviewed(id: string): Promise<void> {
    if (!api) throw new Error("The dashboard is not connected.")
    const existing = reviewInFlight.current.get(id)
    if (existing) return existing
    const note = data?.notes.find((item) => item.id === id)
    if (!note?.review) throw new Error("This card has no review state. Refresh the dashboard.")
    const input = reviewRequests.current.get(id) ?? { id, requestId: crypto.randomUUID(), expectedVersion: note.review.version }
    reviewRequests.current.set(id, input)
    setReviewBusy((count) => count + 1)
    const operation = (async () => {
      try {
        const result = await api.markReviewed(input)
        setData((current) => current ? applyReview(current, result) : current)
        reviewRequests.current.delete(id)
      } catch (error) {
        if (error instanceof ReviewError) {
          reviewRequests.current.delete(id)
          if (error.review) setData((current) => current ? applyReview(current, { id, review: error.review! }) : current)
        }
        throw error
      } finally {
        reviewInFlight.current.delete(id)
        setReviewBusy((count) => count - 1)
      }
    })()
    reviewInFlight.current.set(id, operation)
    return operation
  }

  async function loadMoreNotes() {
    const cursor = data?.notesPage?.nextCursor
    if (!api || !cursor || loadingMoreRef.current || refreshing) return
    const generation = generationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const next = await api.getDashboard(cursor, orderRef.current)
      if (generation !== generationRef.current) return
      setData((current) => current ? {
        ...current, notes: mergeNotes(current.notes, next.notes), notesPage: next.notesPage, progress: next.progress,
      } : current)
    } catch (error) {
      if (generation !== generationRef.current) return
      if (error instanceof ReviewError && error.code === "SESSION_EXPIRED") await load()
      else { setPaginationFailed(true); setError(error instanceof Error ? error.message : "More notes could not be loaded.") }
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
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

  if (redirectTo) return <Navigate to={redirectTo} replace />

  return (
    <TooltipProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {error && <p role="alert" className="p-4 text-destructive">{error}</p>}
      <DashboardShell page={page} user={user}>
        {settingsPage
          ? <SettingsPage data={data} saving={saving} onSave={saveProfile} mode={runtime.mode} user={user} syncChanging={syncChanging} onSyncToggle={toggleSync} onSignOut={signOut} openStandalone={embedded?.openStandalone} />
          : page === "activity" ? <ActivityPage data={data} />
          : page === "patterns" ? <PatternsPage data={data} />
          : <FlashcardsPage data={data} loadingMore={loadingMore || refreshing || paginationFailed} onLoadMore={loadMoreNotes} onDelete={deleteNote}
              onReview={data.capabilities?.reviewScheduling ? markReviewed : undefined} order={order}
              onOrderChange={(next) => { void load(api, next) }} onRefresh={() => { void load() }} refreshing={refreshing || reviewBusy > 0} />}
      </DashboardShell>
    </TooltipProvider>
  )
}

function HomePage() {
  const [mode, setMode] = useState<DashboardRuntimeConfig["mode"]>()

  useEffect(() => {
    let active = true
    void loadDashboardRuntime().then(
      (runtime) => { if (active) setMode(runtime.mode) },
      () => { if (active) setMode("remote") },
    )
    return () => { active = false }
  }, [])

  if (!mode) return <LoadingDashboard />
  return mode === "local" ? <Navigate to="/dashboard" replace /> : <LandingPage />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
