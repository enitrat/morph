// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

import { measureBox, measurementFrame, measureRegion } from "./measure"

function element(style: string, rect = { left: 20, top: 30, width: 200, height: 100 }) {
  const node = document.createElement("div")
  node.style.cssText = style
  Object.defineProperties(node, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 100 },
    getBoundingClientRect: {
      value: () => new DOMRect(rect.left, rect.top, rect.width, rect.height),
    },
  })
  document.body.append(node)
  return node
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("rendered inspection measurements", () => {
  it("normalizes reverse drags without negative dimensions", () => {
    expect(measurementFrame({ x: 150, y: 100 }, { x: 20, y: 30 })).toEqual({
      left: 20,
      top: 30,
      width: 130,
      height: 70,
    })
  })

  it("keeps CSS padding and border values separate from scaled viewport bounds", () => {
    const node = element(
      "padding: 10px 20px; border: 2px solid; border-radius: 50%; transform: matrix(2, 0, 0, 2, 0, 0)",
      { left: 20, top: 30, width: 400, height: 200 },
    )
    expect(measureBox(node)).toMatchObject({
      rect: { width: 400, height: 200 },
      padding: [10, 20, 10, 20],
      border: [2, 2, 2, 2],
      radius: ["50%", "50%", "50%", "50%"],
      scale: { x: 2, y: 2 },
    })
  })

  it("omits inner geometry for rotation, skew and reflection", () => {
    for (const transform of ["matrix(1, 1, 0, 1, 0, 0)", "matrix(-1, 0, 0, 1, 0, 0)"]) {
      expect(measureBox(element(`transform: ${transform}`))?.scale).toBeNull()
    }
    expect(measureBox(element("scale: -1 1"))?.scale).toBeNull()
  })

  it("excludes hidden ancestry and Tune's own controls", () => {
    const parent = element("opacity: 0")
    const child = element("padding: 10px")
    parent.append(child)
    expect(measureBox(child)).toBeNull()
    const tune = document.createElement("tune-root")
    const control = element("padding: 20px")
    tune.append(control)
    document.body.append(tune)
    expect(measureRegion({ left: 0, top: 0, width: 600, height: 400 }).boxes).toEqual([])
  })

  it("reads CSS gap without calling distributed child distances gap", () => {
    const parent = element(
      "display: flex; flex-direction: column; flex-wrap: nowrap; row-gap: 12px; column-gap: 12px; padding: 20px",
    )
    const first = element("background: red", { left: 40, top: 50, width: 100, height: 20 })
    const second = element("background: red", { left: 40, top: 90, width: 100, height: 20 })
    parent.append(first, second)
    const measured = measureRegion({ left: 0, top: 0, width: 600, height: 400 }, parent)
    expect(measured.boxes[0]?.gap).toBe("12px")
    expect(measured.spaces).toContainEqual({
      distance: 20,
      rect: { left: 40, top: 70, width: 100, height: 20 },
    })
  })
})
