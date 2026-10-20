import { ArrowLeftIcon, ArrowRightIcon, LayersIcon, LayoutDashboardIcon, RotateCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react"
import type { CorrectionCategory } from "@language-coach/core"

import { Marked } from "@/components/diff-text"
import { diffWords, isComparable } from "@/lib/word-diff"
import { seedActivity, seedCategories, seedNotes, seedPatterns, type DemoNote } from "@/landing/demo-data"

const SEED_TOTAL = 37

export function useDemoLibrary() {
  const [notes, setNotes] = useState<DemoNote[]>(seedNotes)
  const [patterns, setPatterns] = useState(seedPatterns)
  const [categories, setCategories] = useState(seedCategories)
  const [today, setToday] = useState(0)
  const [lastSaved, setLastSaved] = useState<string>()

  const save = useCallback((note: DemoNote) => {
    setNotes((current) => current.some((item) => item.id === note.id) ? current : [note, ...current])
    setPatterns((current) => {
      const next = [...current]
      for (const { pattern } of note.patterns) {
        const existing = next.findIndex((item) => item.pattern === pattern)
        if (existing >= 0) next[existing] = { pattern, count: next[existing]!.count + 1 }
        else next.unshift({ pattern, count: 1 })
      }
      return next
    })
    setCategories((current) => {
      const next = new Map<CorrectionCategory, number>(current.map((item) => [item.category, item.count]))
      for (const { category } of note.corrections) next.set(category, (next.get(category) ?? 0) + 1)
      return [...next].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
    })
    setToday((count) => count + 1)
    setLastSaved(note.id)
  }, [])

  return useMemo(() => ({ notes, patterns, categories, today, lastSaved, total: SEED_TOTAL + notes.length - seedNotes.length, save }),
    [categories, lastSaved, notes, patterns, save, today])
}

type Library = ReturnType<typeof useDemoLibrary>

function DemoFlashcard({ note, flipped, fresh, onFlip }: { note: DemoNote; flipped: boolean; fresh: boolean; onFlip: () => void }) {
  const diff = note.inputLanguage === "target" && isComparable(note.originalExpression, note.polishedExpression)
    ? diffWords(note.originalExpression, note.polishedExpression)
    : undefined
  return (
    <button type="button" className="demo-card" data-flipped={flipped} onClick={onFlip} aria-label={flipped ? "Show the original message" : "Reveal the natural version"}>
      <span className="demo-card-inner">
        <span className="demo-card-face demo-card-front" aria-hidden={flipped}>
          {fresh && <span className="demo-card-stamp">New</span>}
          <span className="demo-card-label">You wrote</span>
          <span className="demo-card-quote">“{note.originalExpression}”</span>
          <span className="demo-card-tags">{[...new Set(note.corrections.map((item) => item.category))].map((category) => <i key={category}>{category}</i>)}</span>
          <span className="demo-card-prompt">How would a native speaker say it?</span>
          <span className="demo-card-hint"><RotateCwIcon aria-hidden="true" /> Click to flip</span>
        </span>
        <span className="demo-card-face demo-card-back" aria-hidden={!flipped}>
          <span className="demo-card-label">Natural version</span>
          <span className="demo-card-answer">{diff ? <Marked parts={diff.after} kind="added" /> : note.polishedExpression}</span>
          {note.patterns[0] && (
            <span className="demo-card-pattern">
              <b>{note.patterns[0].pattern}</b>
              <span>{note.patterns[0].explanation}</span>
            </span>
          )}
          {note.examples[0] && <span className="demo-card-example">{note.examples[0].text}</span>}
        </span>
      </span>
    </button>
  )
}

function FlashcardView({ library }: { library: Library }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const { notes, lastSaved } = library

  useEffect(() => {
    if (!lastSaved) return
    setIndex(0)
    setFlipped(false)
  }, [lastSaved])

  const note = notes[Math.min(index, notes.length - 1)]!
  const go = (delta: number) => {
    setIndex((current) => (current + delta + notes.length) % notes.length)
    setFlipped(false)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1) }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1) }
  }

  return (
    <div className="demo-flash" onKeyDown={handleKey}>
      <div className="demo-deck">
        <span className="demo-deck-shadow" aria-hidden="true" />
        <span className="demo-deck-shadow" aria-hidden="true" />
        <DemoFlashcard key={note.id} note={note} flipped={flipped} fresh={note.id === lastSaved && index === 0} onFlip={() => setFlipped((value) => !value)} />
      </div>
      <div className="demo-deck-controls">
        <button type="button" onClick={() => go(-1)} aria-label="Previous card"><ArrowLeftIcon /></button>
        <span aria-live="polite">{String(index + 1).padStart(2, "0")} / {String(notes.length).padStart(2, "0")}</span>
        <button type="button" onClick={() => go(1)} aria-label="Next card"><ArrowRightIcon /></button>
      </div>
    </div>
  )
}

function DashboardView({ library }: { library: Library }) {
  const activity = useMemo(() => {
    const days = [...seedActivity]
    days[days.length - 1] = library.today
    return days
  }, [library.today])
  const maxCategory = Math.max(1, ...library.categories.map((item) => item.count))
  const maxDay = Math.max(1, ...activity)

  return (
    <div className="demo-dash">
      <dl className="demo-stats">
        <div><dt>Notes</dt><dd key={library.total} className="tick">{library.total}</dd></div>
        <div><dt>Streak</dt><dd key={`streak-${library.today > 0}`} className="tick">{library.today > 0 ? 7 : 6}d</dd></div>
        <div><dt>Due today</dt><dd>{4 + library.notes.length - seedNotes.length}</dd></div>
      </dl>
      <div className="demo-heatmap" role="img" aria-label="Practice activity over the last 24 weeks">
        {activity.map((count, index) => (
          <i key={index} data-level={count === 0 ? 0 : Math.max(1, Math.ceil((count / maxDay) * 4))} data-today={index === activity.length - 1 || undefined} />
        ))}
      </div>
      <div className="demo-dash-columns">
        <section>
          <h4>Repeat patterns</h4>
          <ol>
            {library.patterns.slice(0, 3).map((item) => (
              <li key={item.pattern} data-fresh={item.count === 1 || undefined}><span>{item.pattern}</span><b>{item.count}×</b></li>
            ))}
          </ol>
        </section>
        <section>
          <h4>Correction mix</h4>
          <ol className="demo-bars">
            {library.categories.slice(0, 4).map((item) => (
              <li key={item.category}><span>{item.category}</span><i style={{ "--w": `${(item.count / maxCategory) * 100}%` } as React.CSSProperties} /></li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

export function DemoLibrary({ library }: { library: Library }) {
  const [view, setView] = useState<"cards" | "dashboard">("cards")
  const [toast, setToast] = useState(false)

  useEffect(() => {
    if (!library.lastSaved) return
    setToast(true)
    const timer = window.setTimeout(() => setToast(false), 2600)
    return () => window.clearTimeout(timer)
  }, [library.lastSaved])

  return (
    <aside className="demo-library" aria-label="Your Language Coach library">
      <div className="demo-library-bar">
        <span className="agent-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="demo-url">language-coach / dashboard</span>
      </div>
      <div className="demo-library-head">
        <div>
          <p className="eyebrow">Your library</p>
          <h3>{view === "cards" ? "Flash cards" : "Activity"}</h3>
        </div>
        <div className="demo-view-switch" role="tablist" aria-label="Library view">
          <button type="button" role="tab" aria-selected={view === "cards"} onClick={() => setView("cards")}><LayersIcon /> Cards</button>
          <button type="button" role="tab" aria-selected={view === "dashboard"} onClick={() => setView("dashboard")}><LayoutDashboardIcon /> Dashboard</button>
        </div>
      </div>
      <div className="demo-library-body" key={view}>
        {view === "cards" ? <FlashcardView library={library} /> : <DashboardView library={library} />}
      </div>
      <p className="demo-toast" data-visible={toast} role="status">
        <span aria-hidden="true">✓</span> Lesson saved. Only the language, not the task.
      </p>
    </aside>
  )
}
