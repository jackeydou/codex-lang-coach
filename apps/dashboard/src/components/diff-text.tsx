import { Fragment, type CSSProperties } from "react"

import type { DiffPart } from "@/lib/word-diff"

/** Renders one side of a word diff with proofreading marks. Each mark gets `--i` so they can animate in order. */
export function Marked({ parts, kind }: { parts: DiffPart[]; kind: "removed" | "added" }) {
  let changed = 0
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "same") return <Fragment key={index}>{part.text}</Fragment>
        const style = { "--i": changed++ } as CSSProperties
        return kind === "removed"
          ? <del key={index} className="mark-removed" style={style}>{part.text}</del>
          : <ins key={index} className="mark-added" style={style}>{part.text}</ins>
      })}
    </>
  )
}
