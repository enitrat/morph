import { describe, expect, it } from "vitest"

import ours from "../bridge/fixtures/acme/morph.config"
import { morphRoute } from "../next"
import { normalizeSelector, rootStateOf, MorphConfig, type MorphConfigInput } from "./config"

const withThemes = (themes: MorphConfigInput["tokens"]["themes"]): MorphConfigInput => ({
  ...ours,
  tokens: { ...ours.tokens, themes },
})

const issuesOf = (input: MorphConfigInput) => {
  const parsed = MorphConfig.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe("morph config", () => {
  it("defaults common presentation fields and rejects invalid prop sources", () => {
    const input = {
      ...ours,
      components: [{ kind: "files" as const, files: "ui/*.tsx", importFrom: "@/ui/{slug}" }],
      plumbing: undefined,
    }
    const config = MorphConfig.parse(input)
    expect(config.plumbing).toEqual([])
    expect(config.components[0]).toMatchObject({
      group: "ui",
      naming: "own",
      href: null,
      props: "cva",
    })
    expect(
      MorphConfig.safeParse({
        ...input,
        components: [{ ...input.components[0], props: "lab-meta" }],
      }).success,
    ).toBe(false)
  })

  it("parses a config with its selectors normalized", () => {
    const config = MorphConfig.parse(ours)
    expect(config.tokens.themes.shared).toEqual([":root", ":where(:root,.light,.dark)"])
    expect(config.tokens.themes.list.map((theme) => theme.selectors)).toEqual([
      [":root,.light", ".light"],
      [".dark"],
    ])
  })

  it("keeps a descendant combinator and unifies quotes", () => {
    expect(normalizeSelector(`[data-theme="claude"]  .dark`)).toBe("[data-theme='claude'] .dark")
    expect(normalizeSelector(`[data-theme="claude"].dark`)).toBe("[data-theme='claude'].dark")
  })

  it("reads what a theme selector requires on <html>", () => {
    expect(rootStateOf(":root")).toEqual({ classes: [], attributes: {} })
    expect(rootStateOf("[data-theme='claude'].dark")).toEqual({
      classes: ["dark"],
      attributes: { "data-theme": "claude" },
    })
    expect(rootStateOf("[data-theme='claude'] .dark")).toBeUndefined()
  })

  it("fails on a theme it cannot resolve or show, naming it", () => {
    expect(
      issuesOf(
        withThemes({
          shared: [":root"],
          list: [
            { name: "light", selectors: [".light"] },
            { name: "dark", selectors: [".dark"], fallback: "dim" },
            { name: "dim", selectors: [".dim .x"], fallback: "dark" },
            { name: "light", selectors: [":root"] },
          ],
        }),
      ),
    ).toEqual([
      "theme dim: .dim .x does not select <html> by class or attribute",
      "theme light is listed twice",
      ":root is in both shared and light",
      "theme dark falls back to itself through dark",
      "theme dim falls back to itself through dim",
    ])
  })

  it("makes the route throw on a config that does not parse", () => {
    expect(() =>
      morphRoute({ ...ours, checks: { ...ours.checks, format: { bin: "rm -rf", args: [] } } }),
    ).toThrow(/bin/)
  })
})
