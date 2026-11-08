import { type DesignSystemWire, isPlumbing } from "../core"
import { type Catalog, catalogOf, labelOf, shortOf } from "../inspector/label"
import { rowOf, seenOf } from "../inspector/target"
import { type Answer, bridge } from "./bridge"

let tokens: Promise<Answer<DesignSystemWire>> | undefined
let plumbing: ReturnType<typeof bridge.plumbing> | undefined
let catalog: Catalog = new Map()

/** Fetch fresh metadata, sharing only requests that are still in flight. */
export function loadTokens(): Promise<Answer<DesignSystemWire>> {
  if (tokens !== undefined) return tokens
  const request = bridge.tokens().then((answer) => {
    if (tokens === request) {
      tokens = undefined
      if (answer.ok)
        catalog = catalogOf(
          answer.value.components.map(({ title, naming, exports }) => ({ title, naming, exports })),
        )
    }
    return answer
  })
  tokens = request
  return request
}

/** Detach requests started before a source write. */
export function invalidateCatalog(): void {
  tokens = undefined
  plumbing = undefined
}

/**
 * Whether a call site at `path` is plumbing to look past when picking. A bridge that cannot answer
 * marks nothing, so locating still works without it.
 */
export async function plumbingAt(path: string): Promise<boolean> {
  if (plumbing === undefined) {
    const request = bridge.plumbing().then((answer) => {
      if (plumbing === request) plumbing = undefined
      return answer
    })
    plumbing = request
  }
  const answer = await plumbing
  return answer.ok && isPlumbing(answer.value.plumbing, path)
}

/** The catalog as loaded so far: empty until the first answer, so names fall back to components. */
export const catalogNow = (): Catalog => catalog

/** `SalesOverview · ‘Your orders’`, or `Sales stats (2)`. */
export const labelNow = (element: Element) => labelOf(seenOf(element), catalog, rowOf(element))

/** `‘Your orders’`, else `SalesOverview`. */
export const shortNow = (element: Element) => shortOf(seenOf(element), catalog, rowOf(element))
