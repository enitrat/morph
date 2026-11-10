// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { pickedOf, repicked } from "./repick"

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

describe("the pick after a Keep", () => {
  it("is the meaningful box the kept code draws where the pick was", () => {
    document.body.innerHTML = `<div id="tile" style="padding: 12px" data-box="0 0 200 100">
      <span data-box="10 10 80 20">Top region</span></div>`
    const picked = pickedOf(byId("tile"))
    // The kept variant replaces the tile with a row at the same spot.
    document.body.innerHTML = `<div id="row" style="padding: 8px" data-box="0 0 600 120">
      <span data-box="90 40 40 20">8.30%</span></div>`

    expect(repicked([picked])).toEqual([byId("row")])
  })

  it("keeps a pick the kept code left in place, and picks nothing on an empty spot", () => {
    document.body.innerHTML = `<div id="card" style="padding: 16px" data-box="0 0 200 100"></div>`
    const kept = pickedOf(byId("card"))
    const gone = pickedOf(document.createElement("div"))

    expect(repicked([kept, { ...gone, at: { x: 900, y: 900 } }])).toEqual([byId("card")])
  })
})
