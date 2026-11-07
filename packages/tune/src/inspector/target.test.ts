// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { catalogOf } from "./label"
import { above, below, instancesOf, leafAt, meaningfulFrom, rowOf, seenOf } from "./target"

const catalog = catalogOf([])

const byId = (id: string) => document.querySelector(`#${id}`) as Element

/** happy-dom lays nothing out: every element gets a box, `[data-box]` sets its own. */
function layOut() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
    this: Element,
  ) {
    const [left = 0, top = 0, width = 100, height = 100] = (
      (this instanceof HTMLElement ? this.dataset.box : undefined) ?? ""
    )
      .split(" ")
      .filter(Boolean)
      .map(Number)
    return DOMRect.fromRect({ x: left, y: top, width, height })
  })
}

/** The elements under the point, top first, as a browser would list them. */
function stack(...ids: string[]) {
  document.elementsFromPoint = () => ids.map(byId)
}

beforeEach(() => {
  layOut()
  document.body.innerHTML = `
    <div id="card" style="padding: 16px">
      <div id="grid">
        <div id="tile" style="background-color: rgb(240, 240, 240)">
          <span id="label">Top region</span>
        </div>
      </div>
    </div>
    <table><tbody><tr id="row" style="position: relative">
      <td id="first"><button id="link" data-box="0 0 120 20">Steakhouse</button></td>
      <td id="cell" data-box="200 0 80 20"><span id="tvl" data-box="200 0 40 20">$2.1M</span></td>
    </tr></tbody></table>`
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("pointing targets", () => {
  it("lands on the nearest box a designer sees, past text and layout wrappers", () => {
    const label = byId("label")
    expect(meaningfulFrom(label, catalog).id).toBe("tile")
  })

  it("climbs past layout-only wrappers to the next box", () => {
    const tile = byId("tile")
    expect(above(tile, catalog)?.id).toBe("card")
  })

  it("descends to the outermost box under the pointer", () => {
    stack("label", "tile", "grid", "card")
    const card = byId("card")
    expect(below(card, 10, 10, catalog)?.id).toBe("tile")
  })

  it("sees through a stretched link to the cell under the pointer", () => {
    stack("link", "tvl", "cell", "row")
    expect(leafAt(210, 10)?.id).toBe("tvl")
    const row = byId("row")
    expect(below(row, 210, 10, catalog)?.id).toBe("cell")
  })
})

describe("pointing at plain elements", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="hero" style="border: 1px solid rgb(0, 0, 0); padding: 16px" data-box="0 0 800 600">
        <div id="copy" data-box="100 0 600 200">
          <h1 id="headline" data-box="100 0 600 100">The easiest way</h1>
          <p id="subtitle" data-box="100 100 600 50">Ship it faster</p>
        </div>
        <figure id="figure" data-box="200 300 400 250">
          <div id="card" inert style="box-shadow: 0 1px 2px black" data-box="200 300 400 250">
            <div id="head" data-box="210 310 380 30"><span id="title" data-box="210 310 80 30">Pricing</span></div>
            <div data-slot="list-item" data-box="210 350 380 40"><span data-slot="list-item-title" data-box="250 350 80 20">Widget</span></div>
          </div>
        </figure>
      </section>`
  })

  it("stops at a headline or a paragraph instead of climbing to the view around them", () => {
    expect(meaningfulFrom(byId("headline"), catalog).id).toBe("headline")
    expect(meaningfulFrom(byId("subtitle"), catalog).id).toBe("subtitle")
    expect(seenOf(byId("headline")).look).toBe("headline")
  })

  it("reaches into an inert preview the browser's hit test skips, and stops at its card", () => {
    // Chrome leaves inert content out of elementsFromPoint, so the figure is the top hit.
    stack("figure", "hero")
    const leaf = leafAt(250, 320)
    expect(leaf?.id).toBe("title")
    expect(leaf && meaningfulFrom(leaf, catalog).id).toBe("card")
    expect(seenOf(byId("card"))).toMatchObject({ look: "box", text: "Pricing" })
  })
})

describe("what a pick shows", () => {
  it("reads a box by its heading over the first text in it", () => {
    document.body.innerHTML =
      '<section id="checkout"><span>Step 1</span><h2>Checkout</h2></section>'
    expect(seenOf(byId("checkout")).text).toBe("Checkout")
  })

  it("finds the row of look-alike tiles a grid holds", () => {
    expect(rowOf(byId("grid"))).toBeNull()
    byId("grid").insertAdjacentHTML("beforeend", '<div class="tile">Total</div>')
    byId("tile").className = "tile"
    expect(rowOf(byId("grid"))).toMatchObject({ count: 2, first: { text: "Top region" } })
  })
})

describe("instances a pick is the root of", () => {
  it("finds client components by their fiber and Server Components by the debug info React sent", () => {
    function Card() {}
    const button = document.createElement("button")
    const page = { name: "Page", env: "Server", props: {} }
    const shell = { name: "Shell", env: "Server", props: {}, owner: page }
    const iconButton = { name: "IconButton", env: "Server", props: { size: "sm" }, owner: page }
    const card = { type: Card, return: null, child: null, memoizedProps: {}, stateNode: null }
    const fiber = {
      type: "button",
      return: { ...card, _debugInfo: [{ time: 1 }, shell] },
      child: null,
      memoizedProps: {},
      stateNode: button,
      _debugInfo: [{ time: 2 }, iconButton],
    }
    Object.assign(button, { __reactFiber$test: fiber })
    const listed = catalogOf([
      { title: "UI", naming: "own", exports: ["IconButton", "Card", "Shell"] },
    ])

    expect(instancesOf(button, listed).map(({ name }) => name)).toEqual([
      "Shell",
      "Card",
      "IconButton",
    ])
  })
})
