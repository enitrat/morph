import { describe, expect, it } from "vitest"

import { deadLinksIn, reasonOf } from "./checks"

describe("links a variant added that go nowhere", () => {
  it("names each added dead link by file and line, and ignores real and removed ones", () => {
    const diff = [
      "+++ b/apps/site/app/x.tsx",
      "@@ -10,0 +11,3 @@",
      '+      <Link href="#">Read more</Link>',
      '+      <Link href="/pricing">Pricing</Link>',
      "+      <a href={''}>Docs</a>",
      "@@ -20 +23,0 @@",
      '-      <Link href="#">Old</Link>',
    ].join("\n")
    expect(reasonOf(deadLinksIn(diff).join("\n")).split("\n")).toEqual([
      "x.tsx:11 This link goes nowhere. Link to a real route or leave the link out.",
      "x.tsx:13 This link goes nowhere. Link to a real route or leave the link out.",
    ])
  })
})

const LINT = [
  "oxlint:",
  "apps/site/app/x.tsx:4:11: warning react-doctor(no-static-element-interactions): Screen reader users can't tell this click handler is interactive. help: add a role.",
  "apps/site/app/x.tsx:2:9: error eslint(no-unused-vars): Variable 'unused' is declared but never used. help: Consider removing this declaration.",
  "apps/site/app/x.tsx:4:34: error jsx-a11y(alt-text): Missing `alt` attribute. help: Must have `alt` prop.",
  "apps/site/app/x.tsx:4:34: error jsx-a11y(alt-text): Missing `alt` attribute. help: Must have `alt` prop.",
].join("\n")

const TYPES = [
  "tsc in apps/site:",
  "app/x.tsx(3,9): error TS2322: Type 'string' is not assignable to type 'number'.",
].join("\n")

describe("the reason a variant failed its checks", () => {
  it("names the first errors by file and line, errors before warnings, each once", () => {
    expect(reasonOf(`${LINT}\n\n${TYPES}`).split("\n")).toEqual([
      "x.tsx:2 Variable 'unused' is declared but never used.",
      "x.tsx:4 Missing `alt` attribute.",
      "x.tsx:3 Type 'string' is not assignable to type 'number'.",
    ])
  })

  it("reads a type error alone", () => {
    expect(reasonOf(TYPES)).toBe("x.tsx:3 Type 'string' is not assignable to type 'number'.")
  })

  it("falls back to the output's first lines, never to a bare tool label", () => {
    expect(reasonOf("oxfmt:\nfailed to parse apps/site/app/x.tsx\nunexpected token")).toBe(
      "failed to parse apps/site/app/x.tsx\nunexpected token",
    )
  })
})
