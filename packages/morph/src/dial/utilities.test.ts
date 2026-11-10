import { describe, expect, it } from "vitest"

import { CONFIG, LIGHT, repoCatalog } from "../bridge/test-fixtures"
import { buildTokens } from "../core/graph"
import { themeModelOf } from "../core/design-system"
import { declarationsOf, scalesOf, stepsOf, swapError, utilityOf } from "./utilities"

const scales = scalesOf(repoCatalog().tokens)
const steps = (className: string) => {
  const utility = utilityOf(className, scales)
  if (utility === undefined) throw new Error(`${className} is not a dial utility`)
  return stepsOf(utility, scales, LIGHT)
}
const around = (list: readonly string[], item: string) => {
  const at = list.indexOf(item)
  return [list[at - 1], list[at + 1]]
}

describe("class stepping", () => {
  it("steps padding along the spacing scale, a side utility as itself", () => {
    expect(around(steps("p-4"), "p-4")).toEqual(["p-3.5", "p-5"])
    expect(around(steps("px-4"), "px-4")).toEqual(["px-3.5", "px-5"])
    expect(steps("gap-x-2")[0]).toBe("gap-x-0")
  })

  it("keeps an off-scale value as a step of its own", () => {
    expect(around(steps("p-13"), "p-13")).toEqual(["p-12", "p-14"])
  })

  it("steps radius through the names the ds compiles, smallest first", () => {
    expect(steps("rounded-md")).toEqual([
      "rounded-none",
      "rounded-xs",
      "rounded-sm",
      "rounded-md",
      "rounded-lg",
      "rounded-xl",
      "rounded-full",
    ])
  })

  it("steps a colour utility only to roles of its hue that have a utility", () => {
    const fills = steps("bg-secondary")
    expect(fills).toContain("bg-secondary")
    expect(fills.every((name) => scales.colors.has(name.slice(3)))).toBe(true)
    expect(fills.length).toBeGreaterThan(1)
  })

  it("reads a scale from @theme only, so a :root role compiles no step", () => {
    expect(scales.radius).not.toContain("control")
    expect(repoCatalog().tokens.graph.has("--radius-control")).toBe(true)
  })

  it("orders calc() steps by the length they resolve to", () => {
    const css = `:root { --radius: 0.625rem; }
@theme inline {
  --radius-lg: var(--radius);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-xl: calc(var(--radius) + 4px);
  --color-primary: var(--primary);
}`
    const tokens = buildTokens(
      [{ path: "app.css", css, tier: "semantic", owned: true }],
      themeModelOf(CONFIG.tokens.themes),
    )
    expect(scalesOf(tokens)).toMatchObject({
      radius: ["sm", "lg", "xl"],
      colors: new Set(["primary"]),
    })
  })

  it("tells a font size from a text colour, and a border width from its colour", () => {
    expect(utilityOf("text-sm", scales)?.family.label).toBe("Size")
    expect(utilityOf("text-foreground", scales)?.family.label).toBe("Colour")
    expect(utilityOf("border", scales)?.family.label).toBe("Width")
    expect(utilityOf("border-border", scales)?.family.label).toBe("Colour")
  })

  it("leaves variants, modifiers and arbitrary values alone", () => {
    for (const name of ["md:p-4", "bg-secondary/50", "p-(--x)", "p-[3px]", "w-full", "rounded"])
      expect(utilityOf(name, scales)).toBeUndefined()
  })

  it("previews a class as the longhands it compiles to", () => {
    const utility = utilityOf("px-4", scales)
    expect(utility && declarationsOf(utility, scales)).toEqual({
      "padding-inline-start": "calc(var(--spacing) * 4)",
      "padding-inline-end": "calc(var(--spacing) * 4)",
    })
  })

  it("refuses a swap across families", () => {
    expect(swapError("p-4", "p-5", scales)).toBeUndefined()
    expect(swapError("p-4", "px-5", scales)).toMatch(/different properties/)
    expect(swapError("p-4", "flex", scales)).toMatch(/not a utility/)
  })
})
