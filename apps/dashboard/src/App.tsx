import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from "react"
import type { DashboardData, DashboardRuntimeConfig, LanguageProfile, LearningNote, SyncStatus } from "@language-coach/core"
import { ActivityIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, BookOpenCheckIcon, CheckIcon, CloudIcon, FlameIcon, HomeIcon, LaptopIcon, LightbulbIcon, LogInIcon, Settings2Icon, SparklesIcon, TargetIcon } from "lucide-react"
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom"

import { AuthPage } from "@/AuthPage"
import { initializeAuth, readAuthSession, type AuthClient, type AuthUser } from "@/auth-client"
import { ActivityChart, CategoryChart, LanguageUseChart } from "@/components/analytics-charts"
import { LandingPage } from "@/LandingPage"
import { LegalPage } from "@/LegalPage"
import { NoteFlashcard } from "@/components/note-flashcard"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDashboardApi, type DashboardApi, UnauthorizedError } from "@/dashboard-api"

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

function ActivityHeatmap({ activity }: { activity: DashboardData["progress"]["activity90Days"] }) {
  const maximum = Math.max(1, ...activity.map((day) => day.count))
  const leadingDays = activity[0]
    ? new Date(`${activity[0].date}T00:00:00Z`).getUTCDay()
    : 0

  return (
    <section className="insight-section" aria-labelledby="activity-heatmap-title">
      <div className="insight-heading">
        <div>
          <p>Last 90 days</p>
          <h2 id="activity-heatmap-title">Practice activity</h2>
        </div>
        <strong>{activity.reduce((total, day) => total + day.count, 0)}</strong>
      </div>
      <div className="activity-heatmap" role="img" aria-label="Learning notes submitted during the last 90 days">
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
    <section className="insight-section repeat-patterns" aria-labelledby="repeat-patterns-title">
      <div className="insight-heading">
        <div><p>Worth revisiting</p><h2 id="repeat-patterns-title">Repeat patterns</h2></div>
        <span>{patterns.length}</span>
      </div>
      {visiblePatterns.length ? (
        <ol>
          {visiblePatterns.map((pattern, index) => (
            <li key={pattern.pattern}>
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="pattern-row" aria-label={`Open pattern: ${pattern.pattern}`}>
                    <span>{String(page * pageSize + index + 1).padStart(2, "0")}</span>
                    <div><strong>{pattern.pattern}</strong><p>{pattern.explanation}</p></div>
                    <b>{pattern.count}×</b>
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

function LearningInsights({ progress }: { progress: DashboardData["progress"] }) {
  return (
    <aside className="learning-insights" aria-label="Learning insights">
      <ActivityHeatmap activity={progress.activity90Days} />
      <RepeatPatterns patterns={progress.recurringPatterns} />
      <section className="insight-section quick-tips" aria-labelledby="quick-tips-title">
        <div className="insight-heading"><div><p>Quick tip</p><h2 id="quick-tips-title">Move between notes</h2></div><LightbulbIcon /></div>
        <p><kbd>↑</kbd><kbd>↓</kbd> or <kbd>J</kbd><kbd>K</kbd> work anywhere on this page. You can also swipe vertically on the card.</p>
      </section>
    </aside>
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
  const [direction, setDirection] = useState<"up" | "down">("up")
  const [outgoingNote, setOutgoingNote] = useState<LearningNote>()
  const pointerStart = useRef<number | undefined>(undefined)
  const touchStart = useRef<{ y: number; atTop: boolean; atBottom: boolean } | undefined>(undefined)
  const wheelDistance = useRef(0)
  const wheelGestureActive = useRef(false)
  const wheelStartedAtBoundary = useRef(false)
  const wheelSwitchedCard = useRef(false)
  const wheelGestureEndTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, notes.length - 1)))
  }, [notes.length])

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

      const forward = ["ArrowDown", "PageDown", "j", "J"].includes(event.key)
      const backward = ["ArrowUp", "PageUp", "k", "K"].includes(event.key)
      if (!forward && !backward) return

      const nextPage = Math.max(0, Math.min(notes.length - 1, page + (forward ? 1 : -1)))
      event.preventDefault()
      if (nextPage === page || !notes[page]) return

      setDirection(forward ? "up" : "down")
      setOutgoingNote(notes[page])
      setPage(nextPage)
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
    setPage(clampedPage)
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
          aria-roledescription="vertical card viewer"
          aria-label={`Card ${page + 1} of ${notes.length}. Swipe, scroll, or use the up and down arrow keys anywhere on the page to change cards.`}
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
            <NoteFlashcard note={activeNote} onDelete={onDelete} />
          </div>
        </div>

        <aside className="flashcard-controls" aria-label="Card navigation">
          <div className="flashcard-deck-status" aria-live="polite">
            <span><strong>{String(page + 1).padStart(2, "0")}</strong></span>
            <span className="flashcard-status-rule" aria-hidden="true" />
            <span>{String(notes.length).padStart(2, "0")}</span>
          </div>
          <div className="flashcard-arrow-buttons">
            <Button variant="outline" size="icon" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Previous card">
              <ArrowUpIcon />
            </Button>
            <Button variant="outline" size="icon" onClick={() => goTo(page + 1)} disabled={page === notes.length - 1} aria-label="Next card">
              <ArrowDownIcon />
            </Button>
          </div>
        </aside>
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
    await onSave({ nativeLanguage, targetLanguage, coachEnabled })
    setMessage("Settings saved.")
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

function DashboardShell({ settingsPage, myNotesPage, data, user, children }: {
  settingsPage: boolean
  myNotesPage: boolean
  data: DashboardData
  user?: AuthUser
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="dashboard-sidebar">
        <SidebarHeader className="dashboard-sidebar-header">
          <div className="dashboard-sidebar-brand">
            <div className="dashboard-sidebar-identity" aria-label="Language Coach">
              <img src="/assets/language-coach-icon.png" alt="" />
              <span>Language Coach</span>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={!settingsPage && !myNotesPage} tooltip="For You">
                    <Link to="/dashboard"><HomeIcon /><span>For You</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={myNotesPage} tooltip="My Notes">
                    <Link to="/dashboard/notes"><BookOpenCheckIcon /><span>My Notes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={settingsPage} tooltip="Settings">
                <Link to="/dashboard/settings"><Settings2Icon /><span>Settings</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {user && <div className="dashboard-sidebar-profile"><span>Signed in</span><strong>{user.email}</strong></div>}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="dashboard-shell-main">
        <SidebarTrigger className="dashboard-mobile-sidebar-trigger md:hidden" />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

function NotesPage({ data, loadingMore, onLoadMore, onDelete }: {
  data: DashboardData
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className="dashboard-feed" id="main-content">
      <div className="dashboard-learning-layout">
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
        <LearningInsights progress={data.progress} />
      </div>
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
      <div className="settings-page" id="main-content">
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
  }, [])

  useEffect(() => {
    if (runtime?.mode !== "local" || !data?.sync?.enabled || auth) return
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
  }, [auth, data?.sync?.enabled, runtime?.mode])

  useEffect(() => {
    if (!api || data?.sync?.state !== "syncing") return
    let cancelled = false
    let timer: number | undefined

    async function pollSync() {
      await load(api)
      if (!cancelled) timer = window.setTimeout(() => { void pollSync() }, 750)
    }

    timer = window.setTimeout(() => { void pollSync() }, 750)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [api, data?.sync?.state])

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
  const myNotesPage = window.location.pathname === "/dashboard/notes" || window.location.pathname.startsWith("/dashboard/notes/")

  return (
    <TooltipProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <DashboardShell settingsPage={settingsPage} myNotesPage={myNotesPage} data={data} user={user}>
        {settingsPage
          ? <SettingsPage data={data} saving={saving} onSave={saveProfile} mode={runtime.mode} user={user} syncChanging={syncChanging} onSyncToggle={toggleSync} onSignOut={signOut} />
          : <NotesPage data={data} loadingMore={loadingMore} onLoadMore={loadMoreNotes} onDelete={deleteNote} />}
      </DashboardShell>
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
