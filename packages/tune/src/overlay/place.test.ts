import { describe, expect, it } from "vitest"

import { PANEL_NARROW, PANEL_WIDTH } from "./model"
import { anchor, dockFor, labelSpots, overlap, tagSpot, uncovered } from "./place"

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
    expect(overlap(box(1000, -500, 1300, -100), "right", PANEL_WIDTH, viewport)).toBe(0)
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
