import { describe, expect, it } from "vitest"

import { PANEL_NARROW, PANEL_WIDTH } from "./model"
import { anchor, cardSpot, dockFor, labelSpots, PIN, pinSpots, tagSpot, uncovered } from "./place"

const viewport = { width: 1440, height: 900 }
const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe("dockFor", () => {
  it("keeps the inspector on the right when the selection sits on the left", () => {
    expect(dockFor(box(100, 100, 500, 300), viewport, "right")).toEqual({
      side: "right",
      width: PANEL_WIDTH,
    })
  })

  it("moves the inspector away from a selection it would cover", () => {
    expect(dockFor(box(1000, 100, 1300, 300), viewport, "right")).toEqual({
      side: "left",
      width: PANEL_WIDTH,
    })
  })

  it("stays put while both sides keep the selection clear", () => {
    expect(dockFor(box(500, 100, 700, 300), viewport, "left").side).toBe("left")
  })

  it("narrows instead of covering a selection that only the narrow width clears", () => {
    // 340 + margins on the right starts at 1080; 280 starts at 1140.
    expect(dockFor(box(340, 100, 1120, 300), viewport, "right")).toEqual({
      side: "right",
      width: PANEL_NARROW,
    })
  })

  it("narrows over a full-width selection and keeps its side when both cover it alike", () => {
    expect(dockFor(box(192, 80, 1248, 600), viewport, "left")).toEqual({
      side: "left",
      width: PANEL_NARROW,
    })
  })

  it("ignores a selection scrolled out of view", () => {
    expect(dockFor(box(1000, -500, 1300, -100), viewport, "right").side).toBe("right")
  })
})

describe("page-anchored surfaces", () => {
  const area = uncovered({ side: "right", width: PANEL_WIDTH }, viewport)

  it("leaves the inspector's side and margins out of the usable area", () => {
    expect(area).toEqual({ left: 0, right: 1440 - 340 - 20 })
    expect(uncovered({ side: "left", width: PANEL_NARROW }, viewport)).toEqual({
      left: 300,
      right: 1440,
    })
  })

  it("puts the action bar below the selection, else above it", () => {
    expect(anchor(box(100, 100, 400, 300), { width: 300, height: 36 }, area, viewport)).toEqual({
      x: 100,
      y: 310,
    })
    expect(anchor(box(100, 700, 400, 820), { width: 300, height: 36 }, area, viewport)).toEqual({
      x: 100,
      y: 654,
    })
  })

  it("keeps the action bar out from under the inspector", () => {
    const { x } = anchor(box(1000, 100, 1080, 140), { width: 300, height: 36 }, area, viewport)
    expect(x + 300).toBeLessThanOrEqual(area.right - 10)
  })

  it("tags a box above its edge, else inside it at the top of the page", () => {
    expect(tagSpot(box(50, 100, 300, 200), { width: 80, height: 19 }, area, viewport)).toEqual({
      x: 50,
      y: 77,
    })
    expect(tagSpot(box(50, 2, 300, 200), { width: 80, height: 19 }, area, viewport)).toEqual({
      x: 50,
      y: 6,
    })
  })

  it("hides a label that would collide with one already placed", () => {
    const spots = labelSpots(
      [box(10, 100, 200, 200), box(20, 102, 100, 150), box(400, 100, 500, 200)],
      [80, 80, 80],
    )
    expect(spots.map((spot) => spot !== null)).toEqual([true, false, true])
    expect(
      labelSpots([box(10, 100, 200, 200), box(20, 102, 100, 150)], [80, 80], (i) => i === 1)[1],
    ).not.toBeNull()
  })
})

const full = { left: 0, right: 1440 }
const card = { width: 340, height: 300 }
const meets = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const cardBox = (spot: { x: number; y: number }) =>
  box(spot.x, spot.y, spot.x + card.width, spot.y + card.height)

describe("pinSpots", () => {
  it("sits on the target's top-right corner", () => {
    expect(pinSpots([box(100, 200, 400, 300)], full, viewport)).toEqual([
      { x: 400 - PIN / 2, y: 200 - PIN / 2 },
    ])
  })

  it("steps a pin left when another already sits on the same corner", () => {
    const [a, b] = pinSpots([box(100, 200, 400, 300), box(150, 200, 405, 280)], full, viewport)
    expect(a).not.toBeNull()
    expect(b?.y).toBe(a?.y)
    expect(b?.x).toBeLessThanOrEqual((a?.x ?? 0) - PIN)
  })

  it("keeps out from under the inspector and hides targets off screen", () => {
    const area = uncovered({ side: "right", width: PANEL_WIDTH }, viewport)
    const [under, gone] = pinSpots(
      [box(900, 200, 1300, 400), box(0, 1200, 10, 1300)],
      area,
      viewport,
    )
    expect((under?.x ?? Infinity) + PIN).toBeLessThanOrEqual(area.right)
    expect(gone).toBeNull()
  })
})

describe("cardSpot", () => {
  it("opens beside the target when there is room on its right", () => {
    expect(cardSpot(box(100, 200, 400, 300), card, full, viewport)).toEqual({
      x: 425,
      y: 200,
      docked: false,
    })
  })

  it("docks to a corner when no side has room, still clear of the target", () => {
    const target = box(279, 120, 1240, 700)
    const spot = cardSpot(target, { width: 260, height: 300 }, full, viewport)
    expect(spot.docked).toBe(true)
    expect(meets(box(spot.x, spot.y, spot.x + 260, spot.y + 300), target)).toBe(false)
  })

  it("never covers its target or runs under the inspector while any clear spot fits", () => {
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let run = 0; run < 2000; run++) {
      const left = random() * 1300
      const top = random() * 900 - 100
      const target = box(left, top, left + 20 + random() * 900, top + 20 + random() * 700)
      const dock = random() < 0.5 ? null : { side: "right" as const, width: PANEL_WIDTH }
      const area = uncovered(dock, viewport)
      const spot = cardSpot(target, card, area, viewport)
      const placed = cardBox(spot)
      expect(placed.left).toBeGreaterThanOrEqual(area.left)
      expect(placed.right).toBeLessThanOrEqual(area.right)
      const seen = box(
        Math.max(target.left, 0),
        Math.max(target.top, 0),
        Math.min(target.right, viewport.width),
        Math.min(target.bottom, viewport.height),
      )
      let room = false
      for (let x = area.left + 10; x + card.width <= area.right - 10 && !room; x += 10)
        for (let y = 10; y + card.height <= viewport.height - 72 && !room; y += 10)
          room = !meets(cardBox({ x, y }), seen)
      if (room) expect(meets(placed, seen), JSON.stringify({ target, dock, spot })).toBe(false)
    }
  })
})
