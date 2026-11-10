import { type BoxPlace, type Catalog, type Place } from "../inspector/label"
import { above, isMorph, leafAt } from "../inspector/target"

/** Where a mark lands in the page: next to, or inside, an element. */
export interface Snapped {
  element: Element
  place: Place
}

/** A rectangle in viewport coordinates. */
interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const visible = (element: Element) => {
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

const middle = (box: Box) => (box.top + box.bottom) / 2

/** Top third before, bottom third after, the rest inside. */
function placeIn(box: Box, y: number): Place {
  const third = (box.bottom - box.top) / 3
  if (y < box.top + third) return "before"
  if (y > box.bottom - third) return "after"
  return "inside"
}

/** The child of `parent` closest to `y`, and which side of it `y` is on. */
function besideChild(parent: Element, y: number): Snapped | null {
  let best: { element: Element; gap: number } | null = null
  for (const child of parent.children) {
    if (isMorph(child) || !visible(child)) continue
    const box = child.getBoundingClientRect()
    const gap = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    if (best === null || gap < best.gap) best = { element: child, gap }
  }
  if (best === null) return null
  if (best.gap === 0) {
    const inner = besideChild(best.element, y)
    if (inner !== null) return inner
  }
  const box = best.element.getBoundingClientRect()
  return { element: best.element, place: y < middle(box) ? "before" : "after" }
}

/** `element`, or its ancestor that is a direct child of `ancestor`. */
function childOf(ancestor: Element, element: Element): Element {
  let node = element
  while (node.parentElement && node.parentElement !== ancestor) node = node.parentElement
  return node
}

/**
 * Where an arrow's head lands. With `from`, the head snaps to the sibling level of `from` under
 * their nearest common ancestor, so "move this below that" names blocks rather than the text
 * under the cursor.
 */
export function snapHead(x: number, y: number, from: Element | null): Snapped | null {
  const hit = leafAt(x, y)
  if (hit === null) return null
  if (from === null) return { element: hit, place: placeIn(hit.getBoundingClientRect(), y) }
  if (from.contains(hit)) return null
  if (hit.contains(from)) return besideChild(hit, y)
  let common: Element | null = hit
  while (common && !common.contains(from)) common = common.parentElement
  if (common === null) return { element: hit, place: placeIn(hit.getBoundingClientRect(), y) }
  const target = childOf(common, hit)
  return { element: target, place: placeIn(target.getBoundingClientRect(), y) }
}

const sameBox = (a: Box, b: Box) =>
  a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom

/**
 * `head`, then each meaningful ancestor that draws a box of its own up to the page, skipping
 * those holding `source`, which it cannot move next to.
 */
function ancestry(head: Element, source: Element, catalog: Catalog): Element[] {
  const chain = [head]
  for (let node = above(head, catalog); node !== null; node = above(node, catalog)) {
    const last = chain.at(-1)
    if (
      last &&
      !node.contains(source) &&
      !sameBox(last.getBoundingClientRect(), node.getBoundingClientRect())
    )
      chain.push(node)
  }
  return chain
}

/**
 * An arrow's head aimed `level` blocks above where it snapped, wrapping back past the page, with
 * its place read again against the bigger box: Tab names "below the tiles" instead of "below one
 * tile".
 */
export function liftHead(
  head: Element,
  source: Element,
  level: number,
  y: number,
  catalog: Catalog,
): Snapped & { level: number } {
  const chain = ancestry(head, source, catalog)
  const at = level % chain.length
  const element = chain[at] ?? head
  return { element, place: placeIn(element.getBoundingClientRect(), y), level: at }
}

const within = (inner: Box, outer: Box, slack: number) =>
  inner.left >= outer.left - slack &&
  inner.top >= outer.top - slack &&
  inner.right <= outer.right + slack &&
  inner.bottom <= outer.bottom + slack

/**
 * Where a box lands: drawn over content, around the largest element it encloses; drawn in a gap,
 * before or after the nearest child of the element that holds the gap.
 */
export function snapBox(box: Box): { element: Element; place: BoxPlace } | null {
  const y = middle(box)
  let hit = leafAt((box.left + box.right) / 2, y)
  if (hit === null) return null
  if (within(hit.getBoundingClientRect(), box, 8)) {
    while (hit.parentElement && within(hit.parentElement.getBoundingClientRect(), box, 8))
      hit = hit.parentElement
    return { element: hit, place: "around" }
  }
  return besideChild(hit, y) ?? { element: hit, place: "inside" }
}
