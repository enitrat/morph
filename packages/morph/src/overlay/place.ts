import { PANEL_NARROW, PANEL_WIDTH, type Side } from "./model"

/** A rectangle in viewport pixels. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** The inspector's distance from the viewport edges. */
export const MARGIN = 10
/** Room kept free at the bottom of the viewport for the session bar. */
const BAR_ROOM = 72
/** How much better the other side must be before the inspector moves, so it does not flap. */
const HYSTERESIS = 4

export const boxOf = (rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
})

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The horizontal span the inspector covers on `side`. */
export function panelSpan(side: Side, width: number, viewport: Viewport): [number, number] {
  return side === "right"
    ? [viewport.width - width - MARGIN, viewport.width - MARGIN]
    : [MARGIN, MARGIN + width]
}

/** How many pixels of `box`'s width run under the inspector, counting its margin as covered. */
function overlap(box: Box, side: Side, width: number, viewport: Viewport): number {
  if (box.bottom < 0 || box.top > viewport.height) return 0
  const [a, b] = panelSpan(side, width, viewport)
  return Math.max(0, Math.min(box.right, b + MARGIN) - Math.max(box.left, a - MARGIN))
}

const other = (side: Side): Side => (side === "right" ? "left" : "right")

/**
 * Where the inspector docks: the side `focus` overlaps least, staying put unless the other side is
 * clearly better. When neither side keeps `focus` clear, the inspector narrows rather than covers.
 */
export function dockFor(
  focus: Box | null,
  viewport: Viewport,
  current: Side,
): { side: Side; width: number } {
  if (focus === null) return { side: current, width: PANEL_WIDTH }
  const clear = (width: number) =>
    [current, other(current)].find((side) => overlap(focus, side, width, viewport) === 0)
  const full = clear(PANEL_WIDTH)
  if (full !== undefined) return { side: full, width: PANEL_WIDTH }
  const narrow = clear(PANEL_NARROW)
  if (narrow !== undefined) return { side: narrow, width: PANEL_NARROW }
  const here = overlap(focus, current, PANEL_NARROW, viewport)
  const there = overlap(focus, other(current), PANEL_NARROW, viewport)
  return { side: there < here - HYSTERESIS ? other(current) : current, width: PANEL_NARROW }
}

/** The part of the viewport that page-anchored surfaces may use: what the inspector leaves. */
export function uncovered(
  dock: { side: Side; width: number } | null,
  viewport: Viewport,
): { left: number; right: number } {
  if (dock === null) return { left: 0, right: viewport.width }
  return dock.side === "right"
    ? { left: 0, right: viewport.width - dock.width - 2 * MARGIN }
    : { left: dock.width + 2 * MARGIN, right: viewport.width }
}

/**
 * A card of `size` beside `box`: below it, else above it, else inside its bottom edge, always in
 * the uncovered area and clear of the session bar.
 */
export function anchor(
  box: Box,
  size: Size,
  area: { left: number; right: number },
  viewport: Viewport,
  gap = 10,
): Point {
  const x = clamp(box.left, area.left + MARGIN, area.right - size.width - MARGIN)
  const limit = viewport.height - BAR_ROOM
  let y = box.bottom + gap
  if (y + size.height > limit) y = box.top - size.height - gap
  if (y < MARGIN) y = clamp(box.bottom - size.height - 12, MARGIN, limit - size.height)
  return { x, y }
}

/** A name tag on `box`'s top-left edge, else inside its top when there is no room above. */
export function tagSpot(
  box: Box,
  size: Size,
  area: { left: number; right: number },
  viewport: Viewport,
): Point {
  const y = box.top - size.height - 4 < 4 ? box.top + 4 : box.top - size.height - 4
  return {
    x: clamp(box.left, area.left + 4, area.right - size.width - 4),
    y: clamp(y, 4, viewport.height - size.height - 4),
  }
}

/**
 * Labels on the top-left corners of `boxes`, in order; a label that would collide with one already
 * placed is `null`, unless it is `kept`.
 */
export function labelSpots(
  boxes: readonly Box[],
  widths: readonly number[],
  kept: (index: number) => boolean = () => false,
  height = 16,
): (Point | null)[] {
  const placed: Box[] = []
  return boxes.map((box, index) => {
    const spot = { x: box.left, y: box.top - height - 2 }
    const area = {
      left: spot.x,
      top: spot.y,
      right: spot.x + (widths[index] ?? 0),
      bottom: spot.y + height,
    }
    const hit = placed.some(
      (other) =>
        area.left < other.right + 2 &&
        area.right > other.left - 2 &&
        area.top < other.bottom + 1 &&
        area.bottom > other.top - 1,
    )
    if (hit && !kept(index)) return null
    placed.push(area)
    return spot
  })
}

/** A pin's diameter. */
export const PIN = 26
const PIN_STEP = PIN + 6

const meets = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Pins on the top-right corners of `targets`, in order: inside the uncovered area, above the
 * session bar, and clear of the pins placed before them, stepping left then down. `null` for a
 * target with no box or off screen.
 */
export function pinSpots(
  targets: readonly (Box | null)[],
  area: { left: number; right: number },
  viewport: Viewport,
): (Point | null)[] {
  const placed: Box[] = []
  const low = viewport.height - BAR_ROOM - PIN
  return targets.map((box) => {
    if (box === null || box.bottom < 0 || box.top > low) return null
    const x0 = clamp(box.right - PIN / 2, area.left + 6, area.right - PIN - 6)
    const y0 = clamp(box.top - PIN / 2, 6, low)
    for (let row = 0; row < 4; row++)
      for (let x = x0; x >= area.left + 6; x -= PIN_STEP) {
        const y = Math.min(y0 + row * PIN_STEP, low)
        const spot = { left: x - 2, top: y - 2, right: x + PIN + 2, bottom: y + PIN + 2 }
        if (placed.some((other) => meets(spot, other))) continue
        placed.push(spot)
        return { x, y }
      }
    return null
  })
}

/** Where a thread card goes; `docked` when it sits on an edge away from its target. */
export interface CardSpot extends Point {
  docked: boolean
}

/**
 * A thread card of `size` for `target`: right of it, else left, below, or above; else docked in a
 * corner of the uncovered area. It never covers the target while any spot clear of it fits, never
 * runs under the inspector, and stays above the session bar.
 */
export function cardSpot(
  target: Box | null,
  size: Size,
  area: { left: number; right: number },
  viewport: Viewport,
  gap = 12,
): CardSpot {
  const { width: w, height: h } = size
  const limit = viewport.height - BAR_ROOM
  const corners: Point[] = [
    { x: area.right - MARGIN - w, y: limit - h },
    { x: area.left + MARGIN, y: limit - h },
    { x: area.right - MARGIN - w, y: MARGIN },
    { x: area.left + MARGIN, y: MARGIN },
  ]
  const boxAt = ({ x, y }: Point): Box => ({ left: x, top: y, right: x + w, bottom: y + h })
  if (target === null) return { ...(corners[0] as Point), docked: true }
  const seen: Box = {
    left: Math.max(target.left, 0),
    top: Math.max(target.top, 0),
    right: Math.min(target.right, viewport.width),
    bottom: Math.min(target.bottom, viewport.height),
  }
  const fits = (box: Box) =>
    box.left >= area.left + MARGIN - 0.5 &&
    box.right <= area.right - MARGIN + 0.5 &&
    box.top >= MARGIN - 0.5 &&
    box.bottom <= limit + 0.5
  const clear = (box: Box) => !meets(box, seen)
  const beside = clamp(target.top, MARGIN, limit - h)
  const across = clamp(target.right - w, area.left + MARGIN, area.right - MARGIN - w)
  const near: Point[] = [
    { x: target.right + PIN / 2 + gap, y: beside },
    { x: target.left - gap - w, y: beside },
    { x: across, y: target.bottom + gap },
    { x: across, y: target.top - gap - h },
  ]
  const fit = near.find((spot) => fits(boxAt(spot)) && clear(boxAt(spot)))
  if (fit !== undefined) return { ...fit, docked: false }
  const covered = (spot: Point) => {
    const box = boxAt(spot)
    return (
      Math.max(0, Math.min(box.right, seen.right) - Math.max(box.left, seen.left)) *
      Math.max(0, Math.min(box.bottom, seen.bottom) - Math.max(box.top, seen.top))
    )
  }
  const best = corners.toSorted((a, b) => covered(a) - covered(b))[0] as Point
  return { ...best, docked: true }
}
