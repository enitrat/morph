import { followBoxes } from "./boxes"
import { type Catalog } from "./label"
import { above, below, isTune, leafAt, meaningfulFrom } from "./target"

type PointKey = "ArrowUp" | "ArrowDown" | "Enter"

const isPointKey = (key: string): key is PointKey =>
  key === "ArrowUp" || key === "ArrowDown" || key === "Enter"

/** Alt+Shift+R toggles pointing, in the app and in the lab. */
export const isPointShortcut = (event: Pick<KeyboardEvent, "altKey" | "shiftKey" | "code">) =>
  event.altKey && event.shiftKey && event.code === "KeyR"

/** The outline and its label, in fixed colours a previewed token edit cannot restyle. */
const OUTLINE_CSS = `
.tune-point {
  position: fixed; top: 0; left: 0; pointer-events: none; z-index: 2147483645;
  outline: 1.5px solid #6236e0; outline-offset: 1px; border-radius: 2px;
  background: rgb(98 54 224 / 0.1);
}
.tune-point-tag {
  position: absolute; left: 0; top: 0; white-space: nowrap; display: flex; align-items: baseline; gap: 6px;
  background: #6236e0; color: #fff; padding: 4px 7px; border-radius: 5px;
  font: 500 12px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased; box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
}
`

const GAP = 6

/**
 * Where the tag sits around its box: above it, else below, else inside its top edge, at its left
 * edge or its right, the first spot inside the viewport that the panel does not cover.
 */
function placeTag(tag: HTMLElement, rect: DOMRect, avoid: DOMRect | null) {
  const width = tag.offsetWidth
  const height = tag.offsetHeight
  const tops = [-height - GAP, rect.height + GAP, GAP]
  const lefts = [-2, rect.width - width + 2]
  const spots = tops.flatMap((top) => lefts.map((left) => ({ top, left })))
  const fits = ({ top, left }: { top: number; left: number }) => {
    const x = rect.left + left
    const y = rect.top + top
    const inView = x >= 0 && y >= 0 && x + width <= innerWidth && y + height <= innerHeight
    const covered =
      avoid !== null &&
      x < avoid.right &&
      avoid.left < x + width &&
      y < avoid.bottom &&
      avoid.top < y + height
    return inView && !covered
  }
  const spot = spots.find(fits) ?? spots[0]
  if (spot) tag.style.transform = `translate(${spot.left}px, ${spot.top}px)`
}

/** A key typed into a field, the page's or Tune's own, is text rather than a command. */
export const isTyping = (event: KeyboardEvent) =>
  event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        (node.isContentEditable || node.tagName === "INPUT" || node.tagName === "TEXTAREA"),
    )

/** The previewed content of a host that shows it inside its own controls, such as the lab. */
const STAGE = "[data-tune-stage]"

/**
 * Whether pointing may land on an element: inside a stage when the page has one, so the host's
 * own controls around it, and the stage itself, stay out of reach; else anywhere.
 */
const inScope = (element: Element) =>
  Boolean(element.parentElement?.closest(STAGE)) || document.querySelector(STAGE) === null

/**
 * The page element under a point, or nothing where Tune's panel or marks are on top, or
 * outside the stage.
 */
function pageAt(x: number, y: number): Element | undefined {
  const top = document.elementFromPoint(x, y)
  if (top === null || isTune(top)) return undefined
  const leaf = leafAt(x, y)
  return leaf !== null && inScope(leaf) ? leaf : undefined
}

/** The meaningful box around `leaf`, kept inside the stage. */
function snapped(leaf: Element, catalog: Catalog): Element {
  const box = meaningfulFrom(leaf, catalog)
  return inScope(box) ? box : leaf
}

const hitAt = (event: MouseEvent) => pageAt(event.clientX, event.clientY)

const press = (event: MouseEvent) => {
  if (hitAt(event)) swallow(event)
}

function swallow(event: Event) {
  event.preventDefault()
  event.stopPropagation()
}

/** A layer for the outline, marked as Tune's so neither pointing nor inspecting lands on it. */
function outlineLayer(): HTMLElement {
  const layer = document.createElement("div")
  layer.dataset.tune = ""
  const style = document.createElement("style")
  style.textContent = OUTLINE_CSS
  layer.append(style)
  document.body.append(layer)
  return layer
}

function followOutline(
  layer: HTMLElement,
  element: Element,
  describe: (element: Element, tag: HTMLElement) => void,
  avoid: () => DOMRect | null,
): () => void {
  const tag = document.createElement("span")
  tag.className = "tune-point-tag"
  describe(element, tag)
  return followBoxes(
    layer,
    [element],
    "tune-point",
    (box) => {
      box.append(tag)
    },
    (_, rect) => {
      placeTag(tag, rect, avoid())
    },
  )
}

type Listeners = { [K in keyof WindowEventMap]?: (event: WindowEventMap[K]) => void }

/** Capture-phase listeners on this window; returns their removal. */
function listen(listeners: Listeners): () => void {
  const entries = Object.entries(listeners) as [string, EventListener][]
  for (const [type, listener] of entries) window.addEventListener(type, listener, true)
  return () => {
    for (const [type, listener] of entries) window.removeEventListener(type, listener, true)
  }
}

/**
 * Pointing over this window's page: the hovered element, snapped to the nearest meaningful box
 * (with Alt held, the exact element), is outlined and `describe` fills its tag, kept clear of
 * `avoid`. ↑ climbs to the next meaningful box, ↓ descends to the one under the pointer; a click
 * or Enter picks it (with Shift, adds it), Esc exits. A press on the page never reaches it;
 * Tune's own layers keep their pointer. On a page with a `data-tune-stage`, only the stage
 * is pointed at and every control around it works as usual. Returns the stop.
 */
export function startPointing({
  describe,
  catalog,
  avoid,
  onPick,
  onExit,
}: {
  describe: (element: Element, tag: HTMLElement) => void
  catalog: () => Catalog
  avoid: () => DOMRect | null
  /** `at`: where the pointer was, in viewport coordinates. */
  onPick: (element: Element, add: boolean, at: { x: number; y: number }) => void
  onExit: () => void
}): () => void {
  const layer = outlineLayer()
  let hovered: Element | undefined
  /** Set by ↑/↓: the pointer keeps that choice while it stays inside it. */
  let stepped = false
  let pointer = { x: 0, y: 0, exact: false }
  let unfollow: (() => void) | undefined
  const show = (element: Element | undefined) => {
    if (element === hovered) return
    hovered = element
    unfollow?.()
    unfollow = element && followOutline(layer, element, describe, avoid)
    // The crosshair only where a click picks; the page's controls keep their own cursor.
    if (element) document.documentElement.style.cursor = "crosshair"
    else document.documentElement.style.removeProperty("cursor")
  }
  const aim = () => {
    const leaf = pageAt(pointer.x, pointer.y)
    stepped = false
    show(leaf && (pointer.exact ? leaf : snapped(leaf, catalog())))
  }
  const key = (name: PointKey, add: boolean) => {
    if (!hovered) return
    if (name === "Enter") {
      onPick(hovered, add, pointer)
      return
    }
    const next =
      name === "ArrowUp"
        ? above(hovered, catalog())
        : below(hovered, pointer.x, pointer.y, catalog())
    if (next === null || !inScope(next)) return
    stepped = true
    show(next)
  }
  const exact = (on: boolean) => {
    if (pointer.exact === on) return
    pointer = { ...pointer, exact: on }
    aim()
  }
  const unlisten = listen({
    pointermove: (event) => {
      const leaf = hitAt(event)
      if (leaf) swallow(event)
      pointer = { x: event.clientX, y: event.clientY, exact: event.altKey }
      if (leaf && stepped && hovered?.contains(leaf)) return
      aim()
    },
    pointerdown: press,
    mousedown: press,
    pointerup: press,
    mouseup: press,
    click: (event) => {
      const element = hitAt(event)
      if (!element) return
      swallow(event)
      onPick(hovered ?? element, event.shiftKey, { x: event.clientX, y: event.clientY })
    },
    pointerout: (event) => {
      if (event.relatedTarget === null) show(undefined)
    },
    keydown: (event) => {
      if (isTyping(event)) return
      if (event.key === "Alt") exact(true)
      else if (event.key === "Escape") {
        swallow(event)
        onExit()
      } else if (isPointKey(event.key) && hovered) {
        swallow(event)
        key(event.key, event.shiftKey)
      }
    },
    keyup: (event) => {
      if (event.key === "Alt") exact(false)
    },
  })
  return () => {
    unlisten()
    document.documentElement.style.removeProperty("cursor")
    unfollow?.()
    layer.remove()
  }
}
