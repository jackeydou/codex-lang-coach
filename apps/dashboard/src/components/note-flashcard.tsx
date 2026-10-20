import { useEffect, useMemo, useState } from "react"
import type { DashboardNote } from "@language-coach/core"
import { CheckIcon, EyeIcon, Trash2Icon } from "lucide-react"

import { isReviewDue } from "@language-coach/core/review"

import { Marked } from "@/components/diff-text"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { diffWords, isComparable } from "@/lib/word-diff"

const CONTEXT_LABELS: Record<string, string> = { work: "Work", shopping: "Shopping", travel: "Travel", social: "Social", everyday: "Daily life", other: "Other" }

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

export function NoteFlashcard({ note, onDelete, onReview, quiz = false, revealed = true, onReveal }: {
  note: DashboardNote
  onDelete: (id: string) => Promise<void>
  onReview?: (id: string) => Promise<void>
  /** Hide the answer of due cards until the learner asks for it. */
  quiz?: boolean
  revealed?: boolean
  onReveal?: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState("")
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    if (!onReview || !note.review?.nextReviewAt) return
    const timer = window.setInterval(() => setClock(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [onReview, note.review?.nextReviewAt])
  const due = note.review ? isReviewDue(note.review, clock) : true
  const hidden = quiz && due && !revealed

  const diff = useMemo(() => note.inputLanguage === "target" && isComparable(note.originalExpression, note.polishedExpression)
    ? diffWords(note.originalExpression, note.polishedExpression)
    : undefined, [note.inputLanguage, note.originalExpression, note.polishedExpression])

  async function markReviewed() {
    if (!onReview || reviewing) return
    // Marking a hidden card reviewed also shows its answer, so the learner can check themselves.
    if (hidden) onReveal?.()
    setReviewing(true)
    setReviewError("")
    try { await onReview(note.id); setClock(Date.now()) }
    catch (error) { setReviewError(error instanceof Error ? error.message : "The review could not be saved.") }
    finally { setReviewing(false) }
  }

  async function deleteNote() {
    setDeleting(true)
    setDeleteError("")
    try {
      await onDelete(note.id)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "The note could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  const status = !note.review ? undefined : note.review.stage === 0 ? "Not studied" : due ? "Due for review" : "Reviewed"

  return (
    <article className="flashcard" data-revealed={!hidden}>
      <header className="flashcard-meta">
        <span className="flashcard-source">{sourceLabel(note)}</span>
        <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time>
        {onReview && status && <span className="flashcard-status" data-due={due}>{status}</span>}
        <div className="flashcard-delete-action">
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
      </header>
      {deleteError && <p role="alert" className="flashcard-error">{deleteError}</p>}

      <div className="flashcard-scroll">
        <section className="flashcard-prompt">
          <p className="flashcard-label">You wrote</p>
          <blockquote>“{diff && !hidden ? <Marked parts={diff.before} kind="removed" /> : note.originalExpression}”</blockquote>
        </section>

        <section className="flashcard-answer" data-hidden={hidden}>
          <div className="flashcard-answer-body" aria-hidden={hidden || undefined} inert={hidden || undefined}>
            <p className="flashcard-label flashcard-label--natural">Natural version</p>
            <p className="flashcard-natural">“{diff ? <Marked parts={diff.after} kind="added" /> : note.polishedExpression}”</p>

            {note.corrections.length > 0 && (
              <section className="lesson-detail-section lesson-corrections">
                <h3>What changed</h3>
                <ul>
                  {note.corrections.map((correction, index) => (
                    <li key={`${correction.original}-${index}`} className="correction-item">
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
          {hidden && (
            <button type="button" className="flashcard-reveal" onClick={onReveal}>
              <EyeIcon aria-hidden="true" />
              <span><strong>How would a native speaker say it?</strong><span>Think of your answer, then reveal it.</span></span>
              <kbd>Space</kbd>
            </button>
          )}
        </section>
      </div>

      {onReview && note.review && (
        <div className="flashcard-review-action" onWheel={(event) => event.stopPropagation()}>
          <div className="flashcard-review-copy" aria-live="polite">
            {note.review.nextReviewAt
              ? <span>Next review <time dateTime={note.review.nextReviewAt}>{new Date(note.review.nextReviewAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></span>
              : <span>First review</span>}
            <span className="review-device-note">Review progress stays on this device.</span>
            {reviewError && <p role="alert" className="text-destructive">{reviewError}</p>}
          </div>
          <Button onClick={() => void markReviewed()} disabled={reviewing || !due} variant={due ? "default" : "outline"}>
            <CheckIcon />{reviewing ? "Saving…" : due ? "Mark reviewed" : "Reviewed"}
          </Button>
        </div>
      )}
    </article>
  )
}
