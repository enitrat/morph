import { describe, expect, it } from "vitest"

import { DARK, LIGHT, repoCatalog } from "../bridge/test-fixtures"
import { parseHex, type TokenName } from "../core"
import { lightness } from "../core/color"
import { resolve } from "../core/graph"
import { type Read } from "../inspector/types"
import { RepoPath } from "../variant/model"
import { type Context, isShared, reachOf, rowsOf, type Seen } from "./rows"
import { scalesOf } from "./utilities"

const { tokens, components } = repoCatalog()
const context: Context = { tokens, scales: scalesOf(tokens), components, theme: LIGHT }
const site = { path: RepoPath.parse("apps/site/x.tsx"), line: 3, col: 5 }

const read = (property: string, token: string, via: Read["via"] = "rule"): Read => ({
  property,
  token: token as TokenName,
  state: "rest",
  via,
})
const seen = (over: Partial<Seen>): Seen => ({ site, classes: [], reads: [], ...over })

describe("fine-tune rows", () => {
  it("makes a class row from a class the tag writes, and a token row from a token read", () => {
    const rows = rowsOf(
      seen({ classes: ["p-4"], reads: [read("padding-inline", "--button-px-md")] }),
      context,
    )
    expect(rows.map((row) => [row.group, row.label, row.tracks.all?.source.kind])).toEqual([
      ["Padding", "Padding", "utility"],
      ["Padding", "Padding x", "token"],
    ])
    const token = rows[1]?.tracks.all
    expect(token?.steps[token.at]?.value).toBe("calc(var(--spacing) * 4)")
    expect(token?.steps[token.at + 1]?.value).toBe("calc(var(--spacing) * 5)")
  })

  it("lets a class own its property, so the token it compiles to adds no second row", () => {
    const rows = rowsOf(
      seen({ classes: ["bg-secondary"], reads: [read("background-color", "--color-secondary")] }),
      context,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tracks.all?.source.kind).toBe("utility")
  })

  it("edits a component colour for all themes and the role under it per theme", () => {
    const [fill] = rowsOf(
      seen({ reads: [read("background-color", "--button-secondary-bg")] }),
      context,
    )
    expect(fill?.tracks.all?.source).toMatchObject({ token: "--button-secondary-bg", scope: "all" })
    expect(fill?.tracks[DARK]?.source).toMatchObject({ token: "--secondary", scope: "dark" })
    const dark = fill?.tracks[DARK]
    expect(dark?.steps[dark.at]?.value).toBe("var(--neutral-800)")
    expect(dark?.steps.every((step) => step.display.kind === "color")).toBe(true)
  })

  it("opens on the component's own token and puts the shared role after it", () => {
    const fillOf = (theme: Context["theme"]) =>
      rowsOf(seen({ reads: [read("background-color", "--button-secondary-bg")] }), {
        ...context,
        theme,
      })[0]
    const fill = fillOf(LIGHT)
    if (fill === undefined) throw new Error("no fill row")
    expect(fill.order).toEqual(["all", "light", "dark"])
    expect(fillOf(DARK)?.order).toEqual(["all", "dark", "light"])

    const own = reachOf(fill, "all")
    expect(own).toMatchObject({ segment: "Button", detail: "--button-secondary-bg", note: null })
    expect(own?.line).toMatch(/^Every Button · \d+ components$/)

    const dark = reachOf(fill, DARK)
    const darkSource = fill.tracks[DARK]?.source
    const reached = darkSource?.kind === "token" && darkSource.impact
    expect(dark?.segment).toBe("Shared dark")
    expect(dark?.line).toBe(`Every secondary surface in dark mode · ${reached} components`)
    expect(dark?.note).toContain("so dark only changes the shared colour")
    expect(dark?.line).not.toContain("--")
  })

  it("marks a shared role's track shared and a component token's not", () => {
    const [fill] = rowsOf(
      seen({ reads: [read("background-color", "--button-secondary-bg")] }),
      context,
    )
    expect(fill?.tracks.all && isShared(fill.tracks.all)).toBe(false)
    const darkTrack = fill?.tracks[DARK]
    expect(darkTrack && isShared(darkTrack)).toBe(true)
  })

  it("orders every colour track from darker to lighter, so + always lightens", () => {
    const [fill] = rowsOf(
      seen({ reads: [read("background-color", "--button-secondary-bg")] }),
      context,
    )
    const scopes = ["all", LIGHT, DARK] as const
    for (const scope of scopes) {
      const track = fill?.tracks[scope]
      expect(track, scope).toBeDefined()
      const theme = scope === "all" ? context.theme : scope
      const lightnesses = (track?.steps ?? []).map((step) => {
        const rgb = parseHex(resolve(tokens, step.value, theme))
        if (rgb === undefined) throw new Error(`${step.value} is not a solid colour`)
        return lightness(rgb)
      })
      expect(lightnesses, scope).toEqual(lightnesses.toSorted((a, b) => a - b))
    }
  })

  it("counts the components a token reaches, once per pick", () => {
    const [row] = rowsOf(seen({ reads: [read("padding-inline", "--button-px-md")] }), context)
    const source = row?.tracks.all?.source
    expect(source?.kind === "token" && source.impact).toBeGreaterThan(0)
  })

  it("offers no row for a scale unit or a fill the element only sits on", () => {
    expect(
      rowsOf(
        seen({
          reads: [
            read("padding", "--spacing"),
            read("background-color", "--button-secondary-bg", "inherited"),
          ],
        }),
        context,
      ),
    ).toEqual([])
  })

  it("has no class rows for an element whose tag was not found", () => {
    expect(rowsOf(seen({ site: null, classes: ["p-4"] }), context)).toEqual([])
  })
})
