import { type AskTarget, type Sketch } from "./model"

/** What the composer sends: what it is about, the words, and the sketch marks on the page. */
export interface AskDraft {
  target: AskTarget
  words: string
  marks: readonly Sketch[]
}

/**
 * The one door from the composer to variant sessions. Sessions are not wired to the new overlay
 * yet, so this logs the draft; the composer keeps it in place.
 */
export function ask(draft: AskDraft): void {
  console.info("[tune] ask", draft)
}
