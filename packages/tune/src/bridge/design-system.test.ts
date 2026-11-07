import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { dependentsOf, impactOf, type TokenName } from "../core"
import { importableOf, readImportable } from "./design-system"
import { CONFIG, REPO, repoCatalog } from "./test-fixtures"

const ds = repoCatalog()
const { graph } = ds.tokens

it("finds the same component imports without loading token sources", () => {
  const config = { ...CONFIG, tokens: { ...CONFIG.tokens, files: ["missing/**/*.css"] } }
  expect(readImportable(REPO, config)).toEqual(importableOf(ds))
})

// Reference: a per-token regex scan over raw component sources.
const UTILITY =
  "(?:bg|text|border(?:-[trblxyse])?|ring|outline|fill|stroke|divide|from|via|to|decoration|caret|accent|placeholder|shadow)"
const escape = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
function regexReads(source: string, token: TokenName): boolean {
  if (new RegExp(`(?:var\\(|\\()${escape(token)}\\b(?![-\\w])`).test(source)) return true
  const role = /^--color-([\w-]+)$/.exec(token)?.[1]
  if (!role) return false
  return new RegExp(`\\b${UTILITY}-${escape(role)}(?![-\\w])`).test(source)
}

describe("component read sets", () => {
  it("reach the same components as the regex scan, for every editable token of the repo", () => {
    expect(ds.components.length).toBeGreaterThanOrEqual(4)
    const components = ds.components.map(({ slug, group, href, reads, files }) => ({
      slug,
      title: slug,
      group,
      href,
      reads,
      files,
      childReads: new Set<TokenName>(),
    }))
    const dirs = components.map((component) => component.slug)
    const tokens = [...graph.values()].filter((node) => node.tier !== "primitive")
    const regexRead = new Map(
      components.map(({ slug, files }) => {
        const source = files.map((file) => readFileSync(join(REPO, file), "utf8")).join("\n")
        return [slug, new Set([...graph.keys()].filter((token) => regexReads(source, token)))]
      }),
    )
    for (const { name } of tokens) {
      const touched = [name, ...dependentsOf(graph, [name])]
      const expected = dirs
        .map((dir) => ({ dir, via: touched.filter((token) => regexRead.get(dir)?.has(token)) }))
        .filter((reach) => reach.via.length > 0)
        .toSorted((a, b) => a.dir.localeCompare(b.dir))
      const impact = impactOf(graph, [{ token: name, scope: "all", to: "" }], components)
      expect(
        impact.components.map((reach) => ({ dir: reach.slug, via: reach.via })),
        name,
      ).toEqual(expected)
    }
  }, 30_000)

  it("reach a block through a design-system component it renders", () => {
    const { tokens, components } = repoCatalog()
    const impact = impactOf(
      tokens.graph,
      [{ token: "--button-px-md", scope: "all", to: "" }],
      components,
    )
    const touch = new Map(impact.components.map((reach) => [reach.slug, reach.touch]))
    expect(touch.get("button")).toBe("edited")
    expect(touch.get("order-summary")).toBe("reached")
    expect(touch.has("badge")).toBe(false)
  })
})
