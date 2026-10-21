import { useMemo, useState } from "react"
import type { DashboardNote } from "@language-coach/core"
import { RotateCwIcon, Trash2Icon } from "lucide-react"

import { isReviewDue } from "@language-coach/core/review"

import { Marked } from "@/components/diff-text"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { diffWords, isComparable } from "@/lib/word-diff"

const CONTEXT_LABELS: Record<string, string> = { work: "Work", shopping: "Shopping", travel: "Travel", social: "Social", everyday: "Daily life", other: "Other" }

export type CardStamp = "got" | "again"

function sourceLabel(note: DashboardNote) {
  if (note.inputLanguage === "native") return `Translated from ${note.nativeLanguage}`
  if (note.inputLanguage === "mixed") return `Mixed ${note.nativeLanguage} and ${note.targetLanguage}`
  if (note.inputLanguage === "other") return "Other language"
  return `Written in ${note.targetLanguage}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
}

export function reviewStatus(note: DashboardNote, now = Date.now()) {
  if (!note.review) return undefined
  if (note.review.stage === 0) return { label: "New", due: true }
  return isReviewDue(note.review, now) ? { label: "Due for review", due: true } : { label: "Reviewed", due: false }
}

function DeleteNote({ note, onDelete }: { note: DashboardNote; onDelete: (id: string) => Promise<void> }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  async function deleteNote() {
    setDeleting(true)
    setError("")
    try {
      await onDelete(note.id)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The note could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flashcard-delete-action">
      {error && <span role="alert" className="flashcard-error">{error}</span>}
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Delete this note"><Trash2Icon /></Button></AlertDialogTrigger>
        <AlertDialogContent className="coach-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this learning note?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the expression, corrections, patterns, and examples.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep note</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteNote()} disabled={deleting}>{deleting ? "Deleting…" : "Delete note"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CardMeta({ note, onDelete }: { note: DashboardNote; onDelete?: (id: string) => Promise<void> }) {
  const status = reviewStatus(note)
  return (
    <header className="flashcard-meta">
      <span className="flashcard-source">{sourceLabel(note)}</span>
      <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time>
      {status && <span className="flashcard-status" data-due={status.due}>{status.label}</span>}
      {onDelete && <DeleteNote note={note} onDelete={onDelete} />}
    </header>
  )
}

/**
 * A two-sided study card. The front asks the learner to recall a natural version of
 * what they wrote; the back marks every change and explains it.
 */
export function NoteFlashcard({ note, flipped, onFlip, onDelete, stamp }: {
  note: DashboardNote
  flipped: boolean
  onFlip?: () => void
  /** Omitted for decorative copies, such as a card that is flying out of the deck. */
  onDelete?: (id: string) => Promise<void>
  stamp?: CardStamp
}) {
  const diff = useMemo(() => note.inputLanguage === "target" && isComparable(note.originalExpression, note.polishedExpression)
    ? diffWords(note.originalExpression, note.polishedExpression)
    : undefined, [note.inputLanguage, note.originalExpression, note.polishedExpression])
  const fixes = note.corrections.length
  const patterns = note.patterns.length

  function flipFromCard() {
    // Selecting text to copy it should not turn the card over.
    if (window.getSelection()?.toString()) return
    onFlip?.()
  }

  return (
    <div className="fc" data-flipped={flipped}>
      <div className="fc-inner">
        <section className="fc-face fc-front" aria-hidden={flipped || undefined} inert={flipped || undefined} aria-label="Card front">
          <CardMeta note={note} onDelete={onDelete} />
          <div className="flashcard-scroll fc-front-body" onClick={flipFromCard}>
            <p className="flashcard-label">You wrote</p>
            <blockquote className="fc-quote">“{note.originalExpression}”</blockquote>
            <div className="fc-teaser">
              {fixes > 0 && <span><b>{fixes}</b> {fixes === 1 ? "fix" : "fixes"}</span>}
              {patterns > 0 && <span><b>{patterns}</b> {patterns === 1 ? "pattern" : "patterns"}</span>}
              {note.examples.length > 0 && <span><b>{note.examples.length}</b> {note.examples.length === 1 ? "example" : "examples"}</span>}
            </div>
            <p className="fc-hint"><RotateCwIcon aria-hidden="true" /> How would a native speaker say it? Flip to check.</p>
          </div>
        </section>

        <section className="fc-face fc-back" aria-hidden={!flipped || undefined} inert={!flipped || undefined} aria-label="Card back">
          <CardMeta note={note} onDelete={onDelete} />
          <div className="flashcard-scroll fc-back-body">
            <p className="flashcard-label">You wrote</p>
            <p className="fc-original">“{diff ? <Marked parts={diff.before} kind="removed" /> : note.originalExpression}”</p>
            <p className="flashcard-label flashcard-label--natural">Natural version</p>
            <p className="flashcard-natural">“{diff ? <Marked parts={diff.after} kind="added" /> : note.polishedExpression}”</p>

            {note.corrections.length > 0 && (
              <section className="lesson-detail-section lesson-corrections">
                <h3>What changed</h3>
                <ul>
                  {note.corrections.map((correction, index) => (
                    <li key={`${correction.original}-${index}`} className="correction-item" style={{ "--i": index } as React.CSSProperties}>
                      <span className="lesson-tag" data-category={correction.category}>{correction.category}</span>
                      <div>
                        <p className="correction-change"><s>{correction.original}</s><span aria-hidden="true">→</span><strong>{correction.replacement}</strong></p>
                        <p className="correction-reason">{correction.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {note.patterns.length > 0 && (
              <section className="lesson-detail-section lesson-patterns">
                <h3>Reusable patterns</h3>
                {note.patterns.map((pattern, index) => (
                  <div key={`${pattern.pattern}-${index}`} className="pattern-item">
                    <strong>{pattern.pattern}</strong>
                    <p>{pattern.explanation}</p>
                  </div>
                ))}
              </section>
            )}
            {note.examples.length > 0 && (
              <section className="lesson-detail-section lesson-examples">
                <h3>Transfer examples</h3>
                <ul>
                  {note.examples.map((example, index) => (
                    <li key={`${example.context}-${index}`}>
                      <span className="example-context" data-context={example.context}>{CONTEXT_LABELS[example.context] ?? example.context}</span><span>{example.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
      </div>
      {stamp && <span className="fc-stamp" data-kind={stamp} aria-hidden="true">{stamp === "got" ? "Got it" : "Again"}</span>}
    </div>
  )
}
