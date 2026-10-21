import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import type { DashboardNote } from "@language-coach/core"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, FlameIcon, RotateCcwIcon, RotateCwIcon, SparklesIcon } from "lucide-react"

import { isReviewDue, REVIEW_INTERVAL_DAYS } from "@language-coach/core/review"

import { NoteFlashcard, type CardStamp } from "@/components/note-flashcard"
import { Button } from "@/components/ui/button"

type Leave = "got" | "again" | "next" | "prev"
type LeavingCard = { note: DashboardNote; kind: Leave; flipped: boolean; fromX: number }

const SWIPE_DISTANCE = 110
const BURST_COLORS = ["var(--brand)", "var(--highlight)", "var(--positive)", "var(--foreground)"]
const MILESTONES: Record<number, string> = { 3: "Three in a row", 5: "On a roll", 10: "Ten straight. Impressive.", 20: "Unstoppable" }

function nextIntervalLabel(note: DashboardNote) {
  const stage = Math.min(note.review?.stage ?? 0, REVIEW_INTERVAL_DAYS.length - 1)
  const days = REVIEW_INTERVAL_DAYS[stage]!
  return days === 1 ? "Back tomorrow" : `Back in ${days} days`
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function Burst({ seed }: { seed: number }) {
  const pieces = useMemo(() => Array.from({ length: 16 }, (_, index) => ({
    angle: (index / 16) * 360 + seeded(index, seed) * 18,
    distance: 60 + seeded(index, seed + 1) * 70,
    size: 5 + seeded(index, seed + 2) * 6,
    color: BURST_COLORS[index % BURST_COLORS.length],
  })), [seed])
  return (
    <span className="deck-burst" aria-hidden="true">
      {pieces.map((piece, index) => (
        <i key={index} style={{ "--a": `${piece.angle}deg`, "--d": `${piece.distance}px`, "--s": `${piece.size}px`, background: piece.color } as CSSProperties} />
      ))}
    </span>
  )
}

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, index) => ({
    left: seeded(index, 3) * 100,
    delay: seeded(index, 4) * 600,
    duration: 1600 + seeded(index, 5) * 1400,
    drift: (seeded(index, 6) - 0.5) * 160,
    spin: (seeded(index, 7) - 0.5) * 900,
    width: 6 + seeded(index, 8) * 6,
    color: BURST_COLORS[index % BURST_COLORS.length],
  })), [])
  return (
    <span className="deck-confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <i key={index} style={{
          left: `${piece.left}%`, width: piece.width, background: piece.color,
          animationDelay: `${piece.delay}ms`, animationDuration: `${piece.duration}ms`,
          "--drift": `${piece.drift}px`, "--spin": `${piece.spin}deg`,
        } as CSSProperties} />
      ))}
    </span>
  )
}

function RoundHud({ reviewed, remaining, streak, milestone }: { reviewed: number; remaining: number; streak: number; milestone?: string }) {
  const total = reviewed + remaining
  return (
    <div className="deck-hud" aria-label="This round">
      <div className="deck-hud-progress">
        <span><b>{reviewed}</b> reviewed · {remaining} left</span>
        <span className="deck-hud-bar" aria-hidden="true"><i style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }} /></span>
      </div>
      <span className="deck-hud-streak" data-active={streak > 0} title="Cards in a row you got right">
        <FlameIcon aria-hidden="true" />
        <b key={streak}>{streak}</b>
      </span>
      {milestone && <span className="deck-hud-toast" role="status" key={milestone}>{milestone}</span>}
    </div>
  )
}

export function FlashcardDeck({ notes, totalNotes, remaining, hasMore, loadingMore, onLoadMore, onDelete, onReview, quiz = false }: {
  notes: DashboardNote[]
  totalNotes: number
  /** Cards still due or new in this review round, across every page. */
  remaining?: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReview?: (id: string) => Promise<void>
  /** Show the front first and grade each card, instead of browsing answers. */
  quiz?: boolean
}) {
  const [activeNoteId, setActiveNoteId] = useState<string>()
  const previousPage = useRef(0)
  const selectedIndex = notes.findIndex((note) => note.id === activeNoteId)
  const page = selectedIndex >= 0 ? selectedIndex : Math.min(previousPage.current, Math.max(0, notes.length - 1))
  useEffect(() => {
    previousPage.current = page
    if (notes[page]?.id !== activeNoteId) setActiveNoteId(notes[page]?.id)
  }, [notes, page, activeNoteId])

  // In a quiz the front comes first; when browsing, the answer does.
  const [toggledId, setToggledId] = useState<string>()
  const [leaving, setLeaving] = useState<LeavingCard>()
  const [enter, setEnter] = useState<"next" | "prev" | "none">("none")
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState("")
  const [shake, setShake] = useState(0)
  const [burst, setBurst] = useState(0)
  const [activeStamp, setActiveStamp] = useState<CardStamp>()
  const [session, setSession] = useState({ reviewed: 0, streak: 0, best: 0 })
  const [milestone, setMilestone] = useState<string>()
  const [celebrating, setCelebrating] = useState(false)
  const pointer = useRef<{ id: number; x: number; y: number; active: boolean } | undefined>(undefined)
  const suppressClick = useRef(false)
  const tiltRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (page >= notes.length - 2 && hasMore && !loadingMore) void onLoadMore()
  }, [hasMore, loadingMore, notes.length, onLoadMore, page])

  // The fly-out normally ends on animationend; this covers hosts that skip animations.
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(undefined), 900)
    return () => window.clearTimeout(timer)
  }, [leaving])

  useEffect(() => {
    if (!milestone) return
    const timer = window.setTimeout(() => setMilestone(undefined), 2200)
    return () => window.clearTimeout(timer)
  }, [milestone])

  useEffect(() => {
    if (!activeStamp) return
    const timer = window.setTimeout(() => setActiveStamp(undefined), 1200)
    return () => window.clearTimeout(timer)
  }, [activeStamp])

  useEffect(() => {
    if (quiz && session.reviewed > 0 && remaining === 0) setCelebrating(true)
  }, [quiz, remaining, session.reviewed])

  const activeNote = notes[page]
  const flipped = activeNote ? (quiz ? toggledId === activeNote.id : toggledId !== activeNote.id) : false
  const due = Boolean(activeNote?.review && isReviewDue(activeNote.review))
  const canGrade = Boolean(onReview && activeNote?.review && due && flipped && !grading)

  function flip() {
    if (!activeNote) return
    setToggledId((current) => current === activeNote.id ? undefined : activeNote.id)
  }

  function goTo(target: number, kind: Leave, fromX = 0) {
    if (!activeNote) return
    const clamped = Math.max(0, Math.min(notes.length - 1, target))
    setDragX(0)
    if (clamped === page) return false
    setLeaving({ note: activeNote, kind, flipped, fromX })
    setEnter(kind === "prev" ? "prev" : "next")
    setToggledId(undefined)
    setGradeError("")
    setActiveNoteId(notes[clamped]?.id)
    return true
  }

  async function grade(kind: "got" | "again", fromX = 0) {
    if (!activeNote) return
    if (kind === "again") {
      setSession((current) => ({ ...current, streak: 0 }))
      if (!goTo(page + 1, "again", fromX)) setActiveStamp("again")
      return
    }
    if (!canGrade || !onReview) return
    setGrading(true)
    setGradeError("")
    try {
      await onReview(activeNote.id)
    } catch (error) {
      setGradeError(error instanceof Error ? error.message : "The review could not be saved.")
      setDragX(0)
      setShake((count) => count + 1)
      return
    } finally {
      setGrading(false)
    }
    setBurst((count) => count + 1)
    const streak = session.streak + 1
    if (MILESTONES[streak]) setMilestone(MILESTONES[streak])
    setSession((current) => ({ reviewed: current.reviewed + 1, streak, best: Math.max(current.best, streak) }))
    if (!goTo(page + 1, "got", fromX)) setActiveStamp("got")
  }

  // Keyboard shortcuts read the latest render through a ref, so the listener is installed once.
  const keys = useRef({ flip, grade, goTo, page, canGrade })
  keys.current = { flip, grade, goTo, page, canGrade }
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog']")) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const onControl = Boolean(target?.closest("button, a"))
      const current = keys.current
      if ((event.key === " " && !onControl) || event.key === "f" || event.key === "F") { event.preventDefault(); current.flip(); return }
      if (["ArrowRight", "j", "J"].includes(event.key)) { event.preventDefault(); current.goTo(current.page + 1, "next"); return }
      if (["ArrowLeft", "k", "K"].includes(event.key)) { event.preventDefault(); current.goTo(current.page - 1, "prev"); return }
      if (event.key === "1" && current.canGrade) { event.preventDefault(); void current.grade("again"); return }
      if ((event.key === "2" || (event.key === "Enter" && !onControl)) && current.canGrade) { event.preventDefault(); void current.grade("got") }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, [role='dialog']")) return
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointer.current
    if (!start || start.id !== event.pointerId) {
      // A gentle tilt toward the mouse makes the card feel like an object, not a panel.
      if (event.pointerType === "mouse" && tiltRef.current && !dragging) {
        const rect = tiltRef.current.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width - 0.5
        const y = (event.clientY - rect.top) / rect.height - 0.5
        tiltRef.current.style.setProperty("--tilt-x", `${(-y * 3).toFixed(2)}deg`)
        tiltRef.current.style.setProperty("--tilt-y", `${(x * 4).toFixed(2)}deg`)
        tiltRef.current.style.setProperty("--glare-x", `${((x + 0.5) * 100).toFixed(1)}%`)
        tiltRef.current.style.setProperty("--glare-y", `${((y + 0.5) * 100).toFixed(1)}%`)
      }
      return
    }
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { pointer.current = undefined; return }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return
      start.active = true
      setDragging(true)
      window.getSelection()?.removeAllRanges()
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setDragX(dx)
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const start = pointer.current
    pointer.current = undefined
    if (!start?.active) return
    setDragging(false)
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    const dx = event.clientX - start.x
    if (cancelled || Math.abs(dx) < SWIPE_DISTANCE) { setDragX(0); return }
    if (dx > 0) {
      if (canGrade) void grade("got", dx)
      else goTo(page - 1, "prev", dx)
    } else if (canGrade) void grade("again", dx)
    else goTo(page + 1, "next", dx)
  }

  function resetTilt() {
    tiltRef.current?.style.removeProperty("--tilt-x")
    tiltRef.current?.style.removeProperty("--tilt-y")
  }

  if (!notes.length || !activeNote) return null

  const swipeRight = canGrade ? "Got it" : page > 0 ? "Back" : undefined
  const swipeLeft = canGrade ? "Again" : page < notes.length - 1 ? "Next" : undefined
  const cue = Math.min(1, Math.abs(dragX) / SWIPE_DISTANCE)
  const ghosts = Math.min(2, notes.length - page - 1 + (hasMore ? 1 : 0))
  const showHud = quiz && Boolean(onReview)

  return (
    <div className="flashcard-deck" aria-label="Language note viewer">
      {showHud && <RoundHud reviewed={session.reviewed} remaining={remaining ?? 0} streak={session.streak} milestone={milestone} />}
      <div className="flashcard-viewer">
        <div
          className="flashcard-deck-stage"
          role="group"
          aria-roledescription="card viewer"
          aria-label={`Card ${page + 1} of ${totalNotes}. Press Space to flip, arrow keys to move, or swipe the card.`}
          data-dragging={dragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onPointerLeave={resetTilt}
          onClickCapture={(event) => { if (suppressClick.current) { event.stopPropagation(); event.preventDefault() } }}
        >
          {Array.from({ length: ghosts }, (_, index) => <span key={index} className="deck-ghost" data-depth={index + 1} aria-hidden="true" />)}

          {leaving && (
            <div key={`${leaving.note.id}-leaving`} className="deck-leaving-card" data-kind={leaving.kind} aria-hidden="true"
              style={{ "--from-x": `${leaving.fromX}px`, "--from-r": `${leaving.fromX / 18}deg` } as CSSProperties}
              onAnimationEnd={(event) => { if (event.currentTarget === event.target) setLeaving(undefined) }}>
              <NoteFlashcard note={leaving.note} flipped={leaving.flipped}
                stamp={leaving.kind === "got" || leaving.kind === "again" ? leaving.kind : undefined} />
            </div>
          )}

          <div key={activeNote.id} className="deck-active-card" data-enter={enter} data-shake={shake % 2 === 1 ? "a" : shake ? "b" : undefined}
            style={{ "--drag-x": `${dragX}px`, "--drag-r": `${dragX / 18}deg` } as CSSProperties}>
            <div className="deck-tilt" ref={tiltRef}>
              <NoteFlashcard note={activeNote} flipped={flipped} onFlip={flip} onDelete={onDelete} stamp={activeStamp} />
            </div>
            {swipeRight && <span className="deck-cue deck-cue--right" data-grade={canGrade} style={{ opacity: dragX > 0 ? cue : 0 }} aria-hidden="true">{swipeRight}</span>}
            {swipeLeft && <span className="deck-cue deck-cue--left" data-grade={canGrade} style={{ opacity: dragX < 0 ? cue : 0 }} aria-hidden="true">{swipeLeft}</span>}
          </div>

          {burst > 0 && <Burst key={burst} seed={burst} />}

          {celebrating && (
            <div className="deck-complete" role="status">
              <Confetti />
              <div className="deck-complete-card">
                <SparklesIcon aria-hidden="true" />
                <p className="flashcard-label flashcard-label--natural">Round complete</p>
                <h2>Every card is reviewed.</h2>
                <p>You reviewed <b>{session.reviewed}</b> {session.reviewed === 1 ? "card" : "cards"}{session.best > 1 && <>, with a best streak of <b>{session.best}</b></>}. They come back when they are due.</p>
                <Button variant="outline" onClick={() => setCelebrating(false)}>Keep browsing</Button>
              </div>
            </div>
          )}
        </div>

        <div className="flashcard-review-action" data-side={flipped ? "back" : "front"} aria-live="polite">
          {!flipped ? (
            <>
              <p className="flashcard-review-copy"><strong>Recall it first.</strong><span>Say the natural version in your head, then check.</span></p>
              <Button data-action="flip" onClick={flip}><RotateCwIcon /> Show answer <kbd>Space</kbd></Button>
            </>
          ) : onReview && activeNote.review && due ? (
            <>
              <p className="flashcard-review-copy">
                <strong>Did you get it?</strong>
                <span>Got it: {nextIntervalLabel(activeNote).toLowerCase()}. Again: stays in this round.</span>
                <span className="review-device-note">Review progress stays on this device.</span>
              </p>
              <div className="flashcard-grade">
                <Button variant="outline" data-action="again" onClick={() => void grade("again")} disabled={grading}><RotateCcwIcon /> Again <kbd>1</kbd></Button>
                <Button data-action="got-it" onClick={() => void grade("got")} disabled={grading}>
                  <CheckIcon /> {grading ? "Saving…" : "Got it"} <kbd>2</kbd>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="flashcard-review-copy">
                {activeNote.review?.nextReviewAt && !due
                  ? <><strong>Reviewed</strong><span>Next review <time dateTime={activeNote.review.nextReviewAt}>{new Date(activeNote.review.nextReviewAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></span></>
                  : <><strong>Natural version</strong><span>Flip to see what you wrote.</span></>}
              </p>
              <Button variant="outline" data-action="flip" onClick={flip}><RotateCwIcon /> Flip <kbd>Space</kbd></Button>
            </>
          )}
          {gradeError && <p role="alert" className="flashcard-grade-error">{gradeError}</p>}
        </div>

        <nav className="flashcard-controls" aria-label="Card navigation">
          <Button variant="ghost" onClick={() => goTo(page - 1, "prev")} disabled={page === 0} aria-label="Previous card">
            <ArrowLeftIcon /> Previous
          </Button>
          <div className="flashcard-deck-status">
            <span aria-live="polite">{String(page + 1).padStart(2, "0")} / {totalNotes}</span>
            <span className="flashcard-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> flip · drag to {canGrade ? "grade" : "move"}</span>
          </div>
          <Button variant="ghost" onClick={() => goTo(page + 1, "next")} disabled={page === notes.length - 1} aria-label="Next card">
            Next <ArrowRightIcon />
          </Button>
        </nav>
      </div>
    </div>
  )
}
