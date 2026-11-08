import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { dependentsOf } from "../core/graph"
import { impactOf } from "../core/impact"
import { type TokenName } from "../core/design-system"
import { buildDesignSystem, importableOf, readImportable } from "./design-system"
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
    const tokens = [...graph.values()].filter((node) => node.tier !== "primitive")
    const regexRead = new Map(
      components.map(({ slug, files }) => {
        const source = files.map((file) => readFileSync(join(REPO, file), "utf8")).join("\n")
        return [slug, new Set([...graph.keys()].filter((token) => regexReads(source, token)))]
      }),
    )
    for (const { name } of tokens) {
      const touched = [name, ...dependentsOf(graph, [name])]
      for (const component of components) {
        const expected = touched.some((token) => regexRead.get(component.slug)?.has(token))
        expect(impactOf(graph, name, [component]), `${name} ${component.slug}`).toBe(
          Number(expected),
        )
      }
    }
  }, 30_000)

  it("reach a block through a design-system component it renders", () => {
    const { tokens, components } = repoCatalog()
    for (const [slug, expected] of [
      ["button", 1],
      ["order-summary", 1],
      ["badge", 0],
    ] as const) {
      const component = components.find((entry) => entry.slug === slug)
      expect(component).toBeDefined()
      if (component) expect(impactOf(tokens.graph, "--button-px-md", [component])).toBe(expected)
    }
  })
})

it("identifies a default component without offering a named import", () => {
  const config = {
    ...CONFIG,
    components: [
      {
        kind: "files" as const,
        files: "src/*.tsx",
        group: "ui",
        naming: "own" as const,
        href: null,
        importFrom: "@ui/button",
        props: "none" as const,
      },
    ],
  }
  const design = buildDesignSystem(
    config,
    new Map([["src/button.tsx", "export default function Button() { return <button /> }"]]),
  )
  expect(design.components[0]?.exports).toEqual(["Button"])
  expect(importableOf(design).flatMap(({ names }) => names)).not.toContain("Button")
})

it("discovers a component exported both by name and as default once", () => {
  const config = {
    ...CONFIG,
    components: [
      {
        kind: "files" as const,
        files: "src/*.tsx",
        group: "ui",
        naming: "own" as const,
        href: null,
        importFrom: "@ui/button",
        props: "none" as const,
      },
    ],
  }
  const design = buildDesignSystem(
    config,
    new Map([
      ["src/button.tsx", "export function Button(){return <button/>}; export default Button"],
    ]),
  )
  expect(design.components[0]?.exports).toEqual(["Button"])
  expect(importableOf(design).flatMap(({ names }) => names)).toEqual(["Button"])
})
