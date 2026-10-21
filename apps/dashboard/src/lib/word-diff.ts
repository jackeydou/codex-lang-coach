export type DiffPart = { text: string; kind: "same" | "removed" | "added" }

const TOKEN = /\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu
const MAX_TOKENS = 400

function tokenize(value: string) {
  return value.match(TOKEN) ?? []
}

function normalize(token: string) {
  return token.toLowerCase().replace(/’/g, "'")
}

function pushPart(parts: DiffPart[], text: string, kind: DiffPart["kind"]) {
  const last = parts[parts.length - 1]
  if (last && last.kind === kind) last.text += text
  else parts.push({ text, kind })
}

/** A word-level diff between two sentences, used to mark what a correction changed. */
export function diffWords(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return { before: [{ text: before, kind: "same" }], after: [{ text: after, kind: "same" }] }
  }

  const words = (tokens: string[]) => tokens.map((token, index) => ({ token, index })).filter(({ token }) => token.trim())
  const left = words(a)
  const right = words(b)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i]![j] = normalize(left[i]!.token) === normalize(right[j]!.token)
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  const keptLeft = new Set<number>()
  const keptRight = new Set<number>()
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (normalize(left[i]!.token) === normalize(right[j]!.token)) {
      keptLeft.add(left[i]!.index)
      keptRight.add(right[j]!.index)
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1
    else j += 1
  }

  const build = (tokens: string[], kept: Set<number>, changed: DiffPart["kind"]) => {
    const parts: DiffPart[] = []
    tokens.forEach((token, index) => {
      if (!token.trim()) {
        // Whitespace joins the surrounding run so marks cover whole phrases.
        const previous = parts[parts.length - 1]
        const next = tokens.slice(index + 1).findIndex((candidate) => candidate.trim())
        const nextIndex = next === -1 ? -1 : index + 1 + next
        const bothChanged = previous?.kind === changed && nextIndex !== -1 && !kept.has(nextIndex)
        pushPart(parts, token, bothChanged ? changed : "same")
        return
      }
      pushPart(parts, token, kept.has(index) ? "same" : changed)
    })
    return parts
  }

  return { before: build(a, keptLeft, "removed"), after: build(b, keptRight, "added") }
}

/** Whether two expressions share enough words for a word diff to read as an edit, not a translation. */
export function isComparable(before: string, after: string) {
  const left = new Set(tokenize(before).filter((token) => /\p{L}/u.test(token)).map(normalize))
  const right = tokenize(after).filter((token) => /\p{L}/u.test(token)).map(normalize)
  if (!left.size || !right.length) return false
  const shared = right.filter((token) => left.has(token)).length
  return shared / right.length >= 0.3
}
