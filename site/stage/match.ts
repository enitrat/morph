import type { AskNode } from "./manifest"

export type Matched =
  | { readonly kind: "exact"; readonly ask: AskNode }
  | { readonly kind: "closest"; readonly ask: AskNode; readonly score: number }
  | { readonly kind: "none" }

/** Below this share of shared words, free text is not taken for a recorded ask. */
const THRESHOLD = 0.4
const STOP = new Set(
  "a an and as at be by for from in into it its me make my of on or our please show the this to up us with".split(
    " ",
  ),
)

const stem = (word: string) => word.replace(/(?:ies|es|s|ing|ed)$/, "").replace(/e$/, "") || word

/** Lowercased content words, stemmed: `Comparing the Plans!` is `{compar, plan}`. */
export const tokensOf = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word !== "" && !STOP.has(word))
      .map(stem),
  )

/** Shared words over all words of both phrasings. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = [...a].filter((word) => b.has(word)).length
  const all = new Set([...a, ...b]).size
  return all === 0 ? 0 : shared / all
}

/** The recorded ask a visitor's words mean: the same words, the closest phrasing, or none. */
export function matchAsk(asks: readonly AskNode[], words: string): Matched {
  const said = tokensOf(words)
  let best: { ask: AskNode; score: number } | null = null
  for (const ask of asks) {
    if (overlap(said, tokensOf(ask.words)) === 1) return { kind: "exact", ask }
    for (const phrasing of [ask.words, ...ask.aliases]) {
      const score = overlap(said, tokensOf(phrasing))
      if (best === null || score > best.score) best = { ask, score }
    }
  }
  return best !== null && best.score >= THRESHOLD
    ? { kind: "closest", ask: best.ask, score: best.score }
    : { kind: "none" }
}
