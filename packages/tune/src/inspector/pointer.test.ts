// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { catalogOf } from "./label"
import { startPointing } from "./pointer"

const byId = (id: string) => document.querySelector(`#${id}`) as Element

/** A click at the element, landing on it as a browser hit-tests the point. */
function clickOn(id: string) {
  const element = byId(id)
  document.elementFromPoint = () => element
  document.elementsFromPoint = () => [element]
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })
  element.dispatchEvent(event)
  return event
}

let stop: (() => void) | undefined

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
  )
})

afterEach(() => {
  stop?.()
  vi.restoreAllMocks()
})

function point(html: string) {
  document.body.innerHTML = html
  const onPick = vi.fn()
  stop = startPointing({
    describe: () => {},
    catalog: () => catalogOf([]),
    avoid: () => null,
    onPick,
    onExit: () => {},
  })
  return onPick
}

describe("pointing on a page with a stage", () => {
  const LAB = `
    <button id="chip">secondary</button>
    <div data-tune-stage><button id="specimen" style="padding: 8px">Save</button></div>`

  it("leaves the host's controls around the stage working", () => {
    const onPick = point(LAB)
    const click = clickOn("chip")
    expect(onPick).not.toHaveBeenCalled()
    expect(click.defaultPrevented).toBe(false)
  })

  it("picks inside the stage", () => {
    const onPick = point(LAB)
    expect(clickOn("specimen").defaultPrevented).toBe(true)
    expect(onPick).toHaveBeenCalledWith(byId("specimen"), false, { x: 5, y: 5 })
  })

  it("picks anywhere on a page without one", () => {
    const onPick = point(`<button id="chip" style="padding: 8px">secondary</button>`)
    clickOn("chip")
    expect(onPick).toHaveBeenCalledWith(byId("chip"), false, { x: 5, y: 5 })
  })
})
