import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { declarationFor, themeNamed, type TokenName } from "../core/design-system"
import { editError, stepsFor } from "../core/edit"
import { ThemeName, TuneConfig, type TuneConfigInput } from "../core/config"
import { scalesOf } from "../dial/utilities"
import { buildDesignSystem, componentFor, importableOf, snapshotOf } from "./design-system"
import { propControls } from "./controls"

const FIXTURES = join(import.meta.dirname, "fixtures")
const DASH = join(FIXTURES, "shadcn-dash")

/** The dashboard's palettes; vercel first, as its default theme. */
const PALETTES = [
  "vercel",
  "claude",
  "discord",
  "supabase",
  "mono",
  "notebook",
  "light-green",
  "zen",
  "astro-vista",
  "whatsapp",
]

const input = {
  tokens: {
    kind: "css",
    files: [
      "node_modules/tailwindcss/theme.css",
      "src/styles/globals.css",
      "src/styles/theme.css",
      "src/styles/themes/*.css",
    ],
    themes: {
      shared: [":root"],
      list: PALETTES.flatMap((palette) => [
        { name: palette, selectors: [`[data-theme='${palette}']`] },
        {
          name: `${palette}-dark`,
          selectors: [`[data-theme='${palette}'].dark`],
          fallback: palette,
        },
      ]),
    },
  },
  components: [
    {
      kind: "files",
      files: "src/components/ui/*.tsx",
      group: "ui",
      naming: "own",
      href: null,
      importFrom: "@/components/ui/{slug}",
      props: "cva",
    },
  ],
  plumbing: [{ prefix: "src/components/ui/" }],
  checks: {
    lint: { bin: "oxlint", args: ["--fix"] },
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "root" },
  },
} satisfies TuneConfigInput

const config = TuneConfig.parse(input)
const TAILWIND = "node_modules/tailwindcss/theme.css"
const ds = buildDesignSystem(
  config,
  new Map([
    ...snapshotOf(DASH, config),
    [TAILWIND, readFileSync(join(FIXTURES, "tailwindcss-theme.css"), "utf8")],
  ]),
)
const { tokens } = ds
const theme = (name: string) => ThemeName.parse(name)
const node = (name: string) => {
  const found = tokens.graph.get(name as TokenName)
  if (found === undefined) throw new Error(`${name} is not a token`)
  return found
}

describe("a shadcn dashboard's design system", () => {
  it("has a light and a dark theme per palette, each dark one reading its palette, then :root", () => {
    expect(tokens.themes.list).toHaveLength(20)
    expect(themeNamed(tokens.themes, "claude-dark").reads).toEqual(["claude-dark", "claude"])
    expect(declarationFor(tokens, node("--primary"), theme("claude-dark")).block).toBe(
      "claude-dark",
    )
    expect(declarationFor(tokens, node("--spacing"), theme("claude-dark")).block).toBe("claude")
    expect(declarationFor(tokens, node("--header-height"), theme("claude-dark")).block).toBe(
      "shared",
    )
  })

  it("steps radius through the palette's calc() steps and Tailwind's defaults around them", () => {
    expect(scalesOf(tokens).radius).toEqual(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"])
    expect(node("--radius-sm").declarations).toEqual([
      expect.objectContaining({ value: "calc(var(--radius) - 4px)", theme: "app" }),
    ])
    expect(node("--radius-2xl").declarations).toEqual([
      expect.objectContaining({ file: TAILWIND, theme: "default" }),
    ])
  })

  it("has colour utilities for its roles and Tailwind's palette", () => {
    const { colors } = scalesOf(tokens)
    expect(colors).toContain("primary")
    expect(colors).toContain("red-500")
  })

  it("never edits a token only Tailwind's own theme declares", () => {
    expect(
      editError(tokens, { token: "--color-red-500", scope: "all", to: "var(--primary)" }),
    ).toBe(`--color-red-500 is declared in ${TAILWIND}, which this repo does not own`)
  })

  it("orders an oklch ramp by lightness, not by its suffixes", () => {
    expect(stepsFor(tokens, "var(--chart-1)", theme("claude"))).toEqual([
      "var(--chart-1)",
      "var(--chart-5)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
    ])
  })

  it("offers each ui component by its own module and reads its props from its cva", async () => {
    const button = componentFor(ds, "Button")
    expect(button).toMatchObject({
      slug: "button",
      group: "ui",
      href: null,
      importFrom: "@/components/ui/button",
      props: { kind: "cva", file: "src/components/ui/button.tsx" },
    })
    expect(importableOf(ds)).toContainEqual({
      specifier: "@/components/ui/button",
      names: ["Button"],
    })
    const controls = await propControls({ root: DASH, dir: "", config }, "Button")
    expect(controls.map((control) => [control.name, control.default])).toEqual([
      ["variant", "default"],
      ["size", "default"],
    ])
  })
})
