import { describe, expect, it } from "vitest"

import { varDeclarations } from "./reads"

/** A rule's style as Chrome exposes `padding-inline: var(--x); color: var(--y); gap: 4px`. */
function chromeStyle(): CSSStyleDeclaration {
  const values: Record<string, string> = {
    "padding-inline-start": "",
    "padding-inline-end": "",
    "padding-inline": "var(--button-px-md)",
    color: "var(--secondary-foreground)",
    gap: "4px",
  }
  const items = ["padding-inline-start", "padding-inline-end", "color", "gap"]
  return {
    length: items.length,
    item: (at: number) => items[at] ?? "",
    getPropertyValue: (property: string) => values[property] ?? "",
    cssText: "padding-inline: var(--button-px-md); color: var(--secondary-foreground); gap: 4px;",
  } as unknown as CSSStyleDeclaration
}

describe("varDeclarations", () => {
  it("reads a shorthand whose longhands enumerate empty", () => {
    expect(new Map(varDeclarations(chromeStyle()))).toEqual(
      new Map([
        ["padding-inline", "var(--button-px-md)"],
        ["color", "var(--secondary-foreground)"],
      ]),
    )
  })
})
