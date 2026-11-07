// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { aimOf } from "./sketch"

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
  // Every element whose box holds the point, the innermost first, as a browser lists them.
  document.elementsFromPoint = (x, y) =>
    [...document.body.querySelectorAll("[data-box]")]
      .filter((element) => {
        const box = boxOf(element)
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
      })
      .toReversed()
  document.body.innerHTML = `
    <div id="card" style="padding: 16px" data-box="0 0 600 300">
      <div id="content" data-box="0 0 600 300">
        <div id="orders" style="padding: 8px" data-box="16 16 568 80">
          <span id="label" data-box="16 16 100 20">Your orders</span>
        </div>
        <div id="tiles" data-box="16 120 568 120">
          <div class="tile" style="padding: 12px" data-box="16 120 280 120"><span>Top region</span></div>
          <div class="tile" style="padding: 12px" data-box="304 120 280 120"><span>Total</span></div>
        </div>
      </div>
    </div>`
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("an arrow's reading", () => {
  it("moves the block under the drag's start, inside the card around both ends", () => {
    const aim = aimOf({ x: 30, y: 25 }, { x: 300, y: 235 }, 0)
    expect(aim).toMatchObject({ source: byId("orders"), to: { element: byId("tiles") } })
    expect("why" in aim ? aim.why : aim.to.place).toBe("after")
  })

  it("says why when the arrow ends inside the block it moves", () => {
    expect(aimOf({ x: 30, y: 25 }, { x: 400, y: 60 }, 0)).toEqual({
      why: "The arrow ends inside the block it moves. End it outside that block.",
    })
  })

  it("says why when the arrow starts off the page's blocks", () => {
    expect(aimOf({ x: 900, y: 900 }, { x: 300, y: 235 }, 0)).toEqual({
      why: "Start the arrow on the block you want to move.",
    })
  })
})
