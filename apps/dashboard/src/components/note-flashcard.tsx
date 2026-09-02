import { useState } from "react"
import type { LearningNote } from "@language-coach/core"
import { ArrowLeftRightIcon, LightbulbIcon, Trash2Icon } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function NoteFlashcard({ note, onDelete }: {
  note: LearningNote
  onDelete: (id: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)

  async function deleteNote() {
    setDeleting(true)
    try {
      await onDelete(note.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="flashcard" data-revealed="true">
      <div className="flashcard-delete-action">
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Delete this note"><Trash2Icon /></Button></AlertDialogTrigger>
          <AlertDialogContent>
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

      <CardContent className="flashcard-scroll flex flex-1 flex-col gap-5">
        <div className="flashcard-face flex flex-col gap-5">
          <div className="flashcard-expression-pair">
            <div className="expression-column expression-column--original">
              <div className="expression-label expression-label--original">You wrote</div>
              <blockquote className="mt-2 text-balance">“{note.originalExpression}”</blockquote>
            </div>
            <ArrowLeftRightIcon className="flashcard-pair-arrow" aria-hidden="true" />
            <div className="expression-column expression-column--natural">
              <div className="expression-label expression-label--natural">Natural version</div>
              <p className="mt-2 text-pretty">“{note.polishedExpression}”</p>
            </div>
          </div>
          {note.corrections.length > 0 && (
            <section className="lesson-detail-section lesson-corrections">
              <h3 className="flex items-center gap-2 text-sm font-medium"><ArrowLeftRightIcon /> What changed</h3>
              <ul>
                {note.corrections.map((correction, index) => (
                  <li key={`${correction.original}-${index}`} className="correction-item">
                    <div className="correction-change">
                      <Badge className="lesson-tag lesson-tag--correction" data-category={correction.category}>{correction.category}</Badge>
                      <span><s className="text-muted-foreground">{correction.original}</s> → <strong>{correction.replacement}</strong></span>
                    </div>
                    <p className="text-muted-foreground">{correction.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {note.patterns.length > 0 && (
            <section className="lesson-detail-section lesson-patterns">
              <h3 className="flex items-center gap-2 text-sm font-medium"><LightbulbIcon /> Reusable patterns</h3>
              {note.patterns.map((pattern, index) => (
                <div key={`${pattern.pattern}-${index}`} className="pattern-item">
                  <strong>{pattern.pattern}</strong>
                  <p className="text-muted-foreground">{pattern.explanation}</p>
                </div>
              ))}
            </section>
          )}
          {note.examples.length > 0 && (
            <section className="lesson-detail-section lesson-examples">
              <h3 className="text-sm font-medium">Transfer examples</h3>
              <ul>
                {note.examples.map((example, index) => (
                  <li key={`${example.context}-${index}`}>
                    <Badge className="lesson-tag lesson-tag--context" data-context={example.context}>{example.context}</Badge><span>{example.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
