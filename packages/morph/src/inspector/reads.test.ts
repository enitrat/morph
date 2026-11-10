// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { RuleIndex, varDeclarations } from "./reads"

/** A rule's style as Chrome exposes `padding-inline: var(--x); color: var(--y); gap: 4px`. */
function chromeStyle(): Parameters<typeof varDeclarations>[0] {
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
  }
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

it("keeps commas inside selector functions and attributes in one alternative", () => {
  const style = document.createElement("style")
  style.textContent = ':is(.one, .two), [data-label="a,b"], .three { color: var(--ink); }'
  document.head.append(style)
  const index = new RuleIndex()
  try {
    expect(index.all.map((entry) => entry.base)).toEqual([
      ":is(.one, .two)",
      '[data-label="a,b"]',
      ".three",
    ])
  } finally {
    index.dispose()
    style.remove()
  }
})
