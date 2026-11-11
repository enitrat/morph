// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { captureTarget, resolveTargets, targetElements } from "./pinned-targets"

const byId = (id: string) => document.querySelector(`#${id}`) as Element

const boxOf = (element: Element) => {
  const [left = 0, top = 0, width = 0, height = 0] = (
    (element instanceof HTMLElement ? element.dataset.box : undefined) ?? ""
  )
    .split(" ")
    .map(Number)
  return DOMRect.fromRect({ x: left, y: top, width, height })
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
    this: Element,
  ) {
    return boxOf(this)
  })
  document.elementsFromPoint = (x, y) =>
    [...document.body.querySelectorAll("[data-box]")]
      .filter((element) => {
        const box = boxOf(element)
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
      })
      .toReversed()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("pinned target resolution", () => {
  it("is the meaningful box the kept code draws where the pick was", () => {
    document.body.innerHTML = `<div id="tile" style="padding: 12px" data-box="0 0 200 100">
      <span data-box="10 10 80 20">Top region</span></div>`
    const picked = captureTarget(byId("tile"))
    // The kept variant replaces the tile with a row at the same spot.
    document.body.innerHTML = `<div id="row" style="padding: 8px" data-box="0 0 600 120">
      <span data-box="90 40 40 20">8.30%</span></div>`

    const targets = resolveTargets([picked])
    expect(targets).toHaveLength(1)
    expect(targets[0]?.match).toEqual({ kind: "position", element: byId("row") })
    expect(targets[0]?.reference).toBe(picked.reference)
    expect(targetElements(targets)).toEqual([byId("row")])
  })

  it("keeps a pick the kept code left in place, and picks nothing on an empty spot", () => {
    document.body.innerHTML = `<div id="card" style="padding: 16px" data-box="0 0 200 100"></div>`
    const kept = captureTarget(byId("card"))
    const gone = captureTarget(document.createElement("div"))

    const targets = resolveTargets([kept, { ...gone, at: { x: 900, y: 900 } }])
    expect(targets).toHaveLength(2)
    expect(targets[0]).toBe(kept)
    expect(targets[1]?.match).toEqual({ kind: "missing" })
    expect(targets[1]?.reference).toBe(gone.reference)
    expect(targetElements(targets)).toEqual([byId("card")])
  })
})

it("preserves distinct reference slots when replacement targets converge on one element", () => {
  document.body.innerHTML = `<div id="a" style="padding: 8px" data-box="0 0 100 100"></div><div id="b" style="padding: 24px" data-box="200 0 100 100"></div>`
  const before = [captureTarget(byId("a")), captureTarget(byId("b"))]
  document.body.innerHTML = `<div id="merged" style="padding: 40px" data-box="0 0 400 100"></div>`
  const targets = resolveTargets(before)
  expect(targets).toHaveLength(2)
  expect(targets.map((target) => target.reference?.spec.padding[0])).toEqual([8, 24])
  expect(targets.map((target) => target.match)).toEqual([
    { kind: "position", element: byId("merged") },
    { kind: "position", element: byId("merged") },
  ])
  expect(targetElements(targets)).toEqual([byId("merged")])
})
