import {
  type Fiber,
  fiberOf,
  type Instance,
  instanceName,
  isComponentName,
  nameOf,
  rootedAt,
  serverComponentsOf,
} from "./fiber"
import { type Catalog, type Look, type Row, type Seen } from "./label"

/** Tune's own nodes, which pointing never lands on. */
const TUNE_SELECTOR = "tune-root, [data-tune], [data-tune-probe]"

export const isTune = (element: Element) => element.closest(TUNE_SELECTOR) !== null

const isPage = (element: Element) =>
  element === document.body || element === document.documentElement

const hasBox = (element: Element) => {
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

const contains = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

/**
 * A stretched link or button: absolutely placed over its parent with no text of its own, or hit
 * at a point its own box does not hold, which only its `::before`/`::after` cover can reach.
 */
function isCover(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect()
  if (!contains(box, x, y)) return true
  const parent = element.parentElement
  if (parent === null || element.textContent.trim() !== "") return false
  const { position } = getComputedStyle(element)
  if (position !== "absolute" && position !== "fixed") return false
  const around = parent.getBoundingClientRect()
  return box.width >= around.width - 1 && box.height >= around.height - 1
}

/**
 * The elements under a point inside `top` that hit testing skips, deepest first: an `inert` or
 * `pointer-events: none` preview still shows a designer its card and rows.
 */
function skippedUnder(top: Element, x: number, y: number): Element[] {
  const found: Element[] = []
  for (let node = top; ;) {
    const child = [...node.children].findLast(
      (candidate) => !isTune(candidate) && contains(candidate.getBoundingClientRect(), x, y),
    )
    if (child === undefined) return found
    found.unshift(child)
    node = child
  }
}

/** Every page element under a viewport point, top first, seen through stretched covers. */
function stackAt(x: number, y: number): Element[] {
  const hits = document.elementsFromPoint(x, y)
  const [top] = hits
  return [...(top === undefined ? [] : skippedUnder(top, x, y)), ...hits].filter(
    (element) => !isTune(element) && !isPage(element) && !isCover(element, x, y),
  )
}

/** The topmost page element under a viewport point. */
export function leafAt(x: number, y: number): Element | null {
  return stackAt(x, y)[0] ?? null
}

/** The component names between this element and the host element above it, innermost first. */
function ownNames(element: Element): string[] {
  return rootedAt(element)
    .map(instanceName)
    .filter((name) => isComponentName(name))
}

/**
 * The catalog components this element is the root of, outermost first: one renders another at the
 * same root, and the instance a designer sets props on is the outermost one that takes props.
 */
export function instancesOf(
  element: Element,
  catalog: Catalog,
): { name: string; instance: Instance }[] {
  return rootedAt(element)
    .flatMap((instance) => {
      const name = instanceName(instance)
      return isComponentName(name) && catalog.has(name) ? [{ name, instance }] : []
    })
    .reverse()
}

const transparent = (color: string) =>
  color === "" ||
  color === "transparent" ||
  /^rgba?\(.*,\s*0\)$/.test(color) ||
  color.endsWith(" / 0)")

const SIDES = ["top", "right", "bottom", "left"] as const

/** A background, a border or a shadow: something a designer sees drawn as a box. */
function isPainted(element: Element): boolean {
  const style = getComputedStyle(element)
  if (!transparent(style.backgroundColor) || !["none", ""].includes(style.backgroundImage))
    return true
  if (!["none", ""].includes(style.boxShadow)) return true
  return SIDES.some(
    (side) =>
      Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      !transparent(style.getPropertyValue(`border-${side}-color`)),
  )
}

const padded = (element: Element) => {
  const style = getComputedStyle(element)
  return SIDES.some((side) => Number.parseFloat(style.getPropertyValue(`padding-${side}`)) > 0)
}

const HEADINGS = "h2, h3, h4, h5, h6, [role=heading]"

/** What the element itself shows a designer, as a pick names it; `null` for a plain wrapper. */
function lookOf(element: Element): Look | null {
  if (element.matches("h1")) return "headline"
  if (element.matches(HEADINGS)) return "heading"
  if (element.matches("p")) return "text"
  return isPainted(element) ? "box" : null
}

/** The root of a catalog component or block, a heading or paragraph, or a visible box. */
function isMeaningful(element: Element, catalog: Catalog): boolean {
  if (isTune(element) || isPage(element) || !hasBox(element)) return false
  return (
    ownNames(element).some((name) => catalog.has(name)) ||
    lookOf(element) !== null ||
    padded(element)
  )
}

/** The element itself or its nearest meaningful ancestor; the element when none is. */
export function meaningfulFrom(element: Element, catalog: Catalog): Element {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (isMeaningful(node, catalog)) return node
  }
  return element
}

/** The nearest meaningful ancestor, or `null` at the top. */
export function above(element: Element, catalog: Catalog): Element | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (isMeaningful(node, catalog)) return node
  }
  return null
}

const outermost = (nodes: readonly Element[]) =>
  nodes.find((node) => !nodes.some((other) => other !== node && other.contains(node))) ?? null

/**
 * The outermost meaningful element inside `element` under the point, else the outermost element
 * there at all; `null` when nothing under the point is inside it.
 */
export function below(element: Element, x: number, y: number, catalog: Catalog): Element | null {
  const inside = stackAt(x, y).filter(
    (node) => node !== element && element.contains(node) && hasBox(node),
  )
  return outermost(inside.filter((node) => isMeaningful(node, catalog))) ?? outermost(inside)
}

/** What names a box: its heading, legend or label, or a part the code calls its title. */
const HEADING =
  "h1, h2, h3, h4, h5, h6, [role=heading], legend, label, [data-slot$=title], [data-slot$=label]"

/** An item of a list: its title names the item, not the box that holds the list. */
const ITEM = "li, [role=listitem], [data-slot=list-item]"

const inItemOf = (heading: Element, element: Element) => {
  const item = heading.closest(ITEM)
  return item !== null && item !== element && element.contains(item)
}

/** The visible text of the box's heading or label, else its first visible text. */
function textIn(element: Element): string | null {
  for (const heading of element.querySelectorAll(HEADING)) {
    const text = heading.textContent.replaceAll(/\s+/g, " ").trim()
    if (text !== "" && hasBox(heading) && !inItemOf(heading, element)) return text
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? ""
    if (text !== "" && node.parentElement && hasBox(node.parentElement)) return text
  }
  return null
}

/**
 * Its visible children that look like its first one, when there are several: a row of tiles, a
 * list. A wrapper with one child is looked through.
 */
function rowIn(element: Element): { first: Element; count: number } | null {
  const [first, ...rest] = [...element.children].filter((child) => !isTune(child) && hasBox(child))
  if (first === undefined) return null
  if (rest.length === 0) return rowIn(first)
  if (first.className === "") return null
  const alike = rest.filter(
    (child) => child.tagName === first.tagName && child.className === first.className,
  ).length
  return alike === 0 ? null : { first, count: alike + 1 }
}

/** The row of look-alike blocks the element holds, as a label reads it; `null` for none. */
export function rowOf(element: Element): Row | null {
  const row = rowIn(element)
  return row && { first: seenOf(row.first), count: row.count }
}

/** What a designer sees of the element: who renders it, its tag and its first text. */
export function seenOf(element: Element): Seen {
  const owners: string[] = []
  for (let fiber: Fiber | null = fiberOf(element) ?? null; fiber; fiber = fiber.return) {
    const names = [nameOf(fiber.type), ...serverComponentsOf(fiber).reverse().map(instanceName)]
    for (const name of names) if (isComponentName(name) && owners.at(-1) !== name) owners.push(name)
  }
  return {
    own: ownNames(element),
    owners,
    tag: element.tagName.toLowerCase(),
    look: lookOf(element),
    text: textIn(element),
  }
}
