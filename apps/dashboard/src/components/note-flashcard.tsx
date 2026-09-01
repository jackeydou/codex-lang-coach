import { useState } from "react"
import type { LearningNote } from "@language-coach/core"
import { ArrowLeftRightIcon, LaptopIcon, LightbulbIcon, Trash2Icon } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

export function NoteFlashcard({ note, onDelete }: { note: LearningNote; onDelete: (id: string) => Promise<void> }) {
  const [revealed, setRevealed] = useState(false)
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
    <Card className="flashcard" data-revealed={revealed}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{note.inputLanguage}</Badge>
          <span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(note.createdAt))}</span>
          {note.source && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={note.source.deviceId}>
              <LaptopIcon className="size-3" /> {note.source.deviceName || `Device ${note.source.deviceId.slice(0, 8)}`}
            </span>
          )}
        </div>
        <CardAction><Badge variant="secondary">{note.nativeLanguage} → {note.targetLanguage}</Badge></CardAction>
        <CardTitle className="sr-only">Language note from {dateFormatter.format(new Date(note.createdAt))}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        {!revealed ? (
          <div className="flashcard-face flex flex-1 flex-col gap-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">You wrote</div>
            <blockquote className="text-balance text-xl leading-relaxed font-medium">“{note.originalExpression}”</blockquote>
            <p className="mt-auto text-sm text-muted-foreground">How would you express this naturally in {note.targetLanguage}?</p>
          </div>
        ) : (
          <div className="flashcard-face flex flex-col gap-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Natural version</div>
              <p className="mt-2 text-pretty text-xl leading-relaxed font-semibold">“{note.polishedExpression}”</p>
            </div>
            {note.corrections.length > 0 && (
              <section className="flex flex-col gap-3">
                <Separator />
                <h3 className="flex items-center gap-2 text-sm font-medium"><ArrowLeftRightIcon /> What changed</h3>
                <ul className="flex flex-col gap-3">
                  {note.corrections.map((correction, index) => (
                    <li key={`${correction.original}-${index}`} className="grid gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{correction.category}</Badge>
                        <span><s className="text-muted-foreground">{correction.original}</s> → <strong>{correction.replacement}</strong></span>
                      </div>
                      <p className="text-muted-foreground">{correction.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {note.patterns.length > 0 && (
              <section className="flex flex-col gap-3">
                <Separator />
                <h3 className="flex items-center gap-2 text-sm font-medium"><LightbulbIcon /> Reusable patterns</h3>
                {note.patterns.map((pattern, index) => (
                  <div key={`${pattern.pattern}-${index}`} className="grid gap-1 text-sm">
                    <strong>{pattern.pattern}</strong>
                    <p className="text-muted-foreground">{pattern.explanation}</p>
                  </div>
                ))}
              </section>
            )}
            {note.examples.length > 0 && (
              <section className="flex flex-col gap-3">
                <Separator />
                <h3 className="text-sm font-medium">Transfer examples</h3>
                <ul className="flex flex-col gap-2">
                  {note.examples.map((example, index) => (
                    <li key={`${example.context}-${index}`} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline">{example.context}</Badge><span>{example.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2">
        <Button variant="outline" onClick={() => setRevealed((value) => !value)}>
          <ArrowLeftRightIcon data-icon="inline-start" />{revealed ? "Show prompt" : "Reveal lesson"}
        </Button>
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
      </CardFooter>
    </Card>
  )
}
