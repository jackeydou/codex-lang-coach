import { Fragment } from "react"

import type { DiffPart } from "@/lib/word-diff"

/** Renders one side of a word diff with proofreading marks. */
export function Marked({ parts, kind }: { parts: DiffPart[]; kind: "removed" | "added" }) {
  return (
    <>
      {parts.map((part, index) => part.kind === "same"
        ? <Fragment key={index}>{part.text}</Fragment>
        : kind === "removed"
          ? <del key={index} className="mark-removed">{part.text}</del>
          : <ins key={index} className="mark-added">{part.text}</ins>)}
    </>
  )
}
