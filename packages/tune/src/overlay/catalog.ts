import { type DesignSystemWire, isPlumbing } from "../core"
import { type Catalog, catalogOf, labelOf, shortOf } from "../inspector/label"
import { rowOf, seenOf } from "../inspector/target"
import { type Answer, bridge } from "./bridge"

let tokens: Promise<Answer<DesignSystemWire>> | undefined
let catalog: Catalog = new Map()

/** The bridge's token sources and catalog, fetched once per page; a failure is asked again. */
export function loadTokens(): Promise<Answer<DesignSystemWire>> {
  tokens ??= bridge.tokens().then((answer) => {
    if (answer.ok)
      catalog = catalogOf(
        answer.value.components.map(({ title, naming, exports }) => ({ title, naming, exports })),
      )
    else tokens = undefined
    return answer
  })
  return tokens
}

/**
 * Whether a call site at `path` is plumbing to look past when picking. A bridge that cannot answer
 * marks nothing, so locating still works without it.
 */
export async function plumbingAt(path: string): Promise<boolean> {
  const answer = await loadTokens()
  return answer.ok && isPlumbing(answer.value.plumbing, path)
}

/** The catalog as loaded so far: empty until the first answer, so names fall back to components. */
export const catalogNow = (): Catalog => catalog

/** `SalesOverview · ‘Your orders’`, or `Sales stats (2)`. */
export const labelNow = (element: Element) => labelOf(seenOf(element), catalog, rowOf(element))

/** `‘Your orders’`, else `SalesOverview`. */
export const shortNow = (element: Element) => shortOf(seenOf(element), catalog, rowOf(element))
