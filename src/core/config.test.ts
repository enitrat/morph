import { describe, expect, it } from "vitest"

import ours from "../bridge/fixtures/acme/tune.config"
import { retouchRoute } from "../bridge/route"
import { normalizeSelector, rootStateOf, TuneConfig, type TuneConfigInput } from "./config"

const withThemes = (themes: TuneConfigInput["tokens"]["themes"]): TuneConfigInput => ({
  ...ours,
  tokens: { ...ours.tokens, themes },
})

const issuesOf = (input: TuneConfigInput) => {
  const parsed = TuneConfig.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe("tune config", () => {
  it("parses a config with its selectors normalized", () => {
    const config = TuneConfig.parse(ours)
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
      retouchRoute({ ...ours, checks: { ...ours.checks, format: { bin: "rm -rf", args: [] } } }),
    ).toThrow(/bin/)
  })
})
