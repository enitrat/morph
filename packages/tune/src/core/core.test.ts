import { describe, expect, it } from "vitest"

import {
  applyEdits,
  buildTokens,
  chainOf,
  editError,
  impactOf,
  displayOf,
  previewCss,
  resolveToken,
  stepsFor,
  tokensReadIn,
  type TokenEdit,
  type TokenName,
} from "."
import { readDesignSystem } from "../bridge/design-system"
import { CONFIG, DARK, LIGHT, REPO } from "../bridge/test-fixtures"

const { tokens } = readDesignSystem(REPO, CONFIG)
const { graph } = tokens
const files = new Map(tokens.files.map((file) => [file.path, file.css]))

function rebuilt(edits: readonly TokenEdit[]) {
  const written = applyEdits(tokens, edits)
  const next = tokens.files.map((file) => ({
    ...file,
    css: written.files.get(file.path) ?? file.css,
  }))
  return { tokens: buildTokens(next, tokens.themes), written }
}

describe("token graph", () => {
  it("follows a component token down to its primitive in each theme", () => {
    expect(chainOf(tokens, "--button-secondary-bg", DARK)).toEqual([
      "--button-secondary-bg",
      "--secondary",
      "--neutral-800",
    ])
    expect(resolveToken(tokens, "--button-secondary-bg", LIGHT)).toBe("#f5f5f5")
  })

  it("lets dark read the base declaration a .dark block leaves out", () => {
    expect(resolveToken(tokens, "--primary", DARK)).toBe("#8b5cf6")
  })
})

describe("writing an edit", () => {
  it("changes only dark when a role is edited for dark", () => {
    const after = rebuilt([{ token: "--secondary", scope: DARK, to: "var(--neutral-700)" }]).tokens
    expect(resolveToken(after, "--button-secondary-bg", DARK)).toBe("#404040")
    expect(resolveToken(after, "--button-secondary-bg", LIGHT)).toBe("#f5f5f5")
  })

  it("pins dark at today's value when a light edit hits a token dark inherits", () => {
    const { tokens: after, written } = rebuilt([
      { token: "--primary", scope: LIGHT, to: "var(--violet-400)" },
    ])
    expect(resolveToken(after, "--primary", LIGHT)).toBe("#a78bfa")
    expect(resolveToken(after, "--primary", DARK)).toBe("#8b5cf6")
    expect(written.changes.map((change) => change.block)).toEqual([DARK, LIGHT])
  })

  it("repoints a component token for both themes and leaves the rest of the file alone", () => {
    const edit = { token: "--button-secondary-bg", scope: "all", to: "var(--inverse)" } as const
    const { tokens: after, written } = rebuilt([edit])
    expect(resolveToken(after, "--button-secondary-bg", DARK)).toBe("#fafafa")
    const path = "packages/ui/src/components/atoms/button/button.tokens.css"
    const before = (files.get(path) ?? "").split("\n")
    const lines = (written.files.get(path) ?? "").split("\n")
    expect(lines.filter((line, index) => line !== before[index])).toEqual([
      "    --button-secondary-bg: var(--inverse);",
    ])
  })
})

it("writes into the block that declares the token when a file opens .light twice", () => {
  const { tokens: after, written } = rebuilt([
    { token: "--panel-tile-bg", scope: LIGHT, to: "var(--card)" },
  ])
  expect(resolveToken(after, "--panel-tile-bg", LIGHT)).toBe(resolveToken(tokens, "--card", LIGHT))
  expect(written.changes.map((change) => change.token)).toContain("--panel-tile-bg")
})

describe("design-system rules", () => {
  it.each([
    [{ token: "--neutral-800", scope: "all", to: "var(--neutral-700)" }, /primitive/],
    [{ token: "--button-secondary-bg", scope: DARK, to: "var(--inverse)" }, /never splits/],
    [
      { token: "--button-secondary-bg", scope: "all", to: "var(--neutral-700)" },
      /point it at a role/,
    ],
    [{ token: "--secondary", scope: DARK, to: "#333333" }, /literal/],
    [{ token: "--secondary", scope: DARK, to: "var(--neutral-800)" }, /already reads/],
    [{ token: "--nope", scope: "all", to: "var(--secondary)" }, /not a ds token/],
  ] as const)("rejects %o", (edit, message) => {
    expect(editError(tokens, edit)).toMatch(message)
  })
})

describe("dial steps", () => {
  it("steps a primitive colour ramp from darker to lighter", () => {
    const steps = stepsFor(tokens, "var(--neutral-800)", DARK)
    expect(steps.indexOf("var(--neutral-700)")).toBe(steps.indexOf("var(--neutral-800)") + 1)
  })

  it("steps a spacing multiple through the spacing scale", () => {
    const steps = stepsFor(tokens, "calc(var(--spacing) * 7)", LIGHT)
    const at = steps.indexOf("calc(var(--spacing) * 7)")
    expect(steps.slice(at - 1, at + 2)).toEqual([
      "calc(var(--spacing) * 6)",
      "calc(var(--spacing) * 7)",
      "calc(var(--spacing) * 8)",
    ])
  })

  it("steps a colour role through every solid role, darkest first", () => {
    const steps = stepsFor(tokens, "var(--secondary)", DARK)
    expect(steps[0]).toBe("var(--background)")
    expect(steps).toContain("var(--secondary)")
    expect(steps.filter((step) => step.startsWith("var(--color-"))).toEqual([])
    expect(steps).not.toContain("var(--primary)")
    expect(steps[steps.indexOf("var(--secondary)") + 1]).toBe("var(--elevated)")
  })
})

describe("impact", () => {
  it("names the components that read an edited role, through tokens and utilities", () => {
    const component = (slug: string, source: string) => ({
      slug,
      title: slug,
      group: "atom",
      href: "",
      reads: new Set(tokensReadIn(source)),
      childReads: new Set<TokenName>(),
    })
    const impact = impactOf(graph, "--secondary", [
      component("button", "bg-(--button-secondary-bg)"),
      component("tag", "className='bg-secondary'"),
      component("role", "var(--secondary)"),
      component("card", "bg-secondary-foreground"),
    ])
    expect(impact).toBe(3)
  })
})

describe("the graph with edits applied", () => {
  it("reads like the graph rebuilt from the written files", () => {
    const edits: TokenEdit[] = [
      { token: "--primary", scope: LIGHT, to: "var(--violet-400)" },
      { token: "--button-secondary-bg", scope: "all", to: "var(--inverse)" },
      { token: "--secondary", scope: DARK, to: "var(--neutral-700)" },
    ]
    const written = rebuilt(edits).tokens
    expect(resolveToken(written, "--primary", LIGHT)).toBe(
      resolveToken(tokens, "--violet-400", LIGHT),
    )
    expect(resolveToken(written, "--primary", DARK)).toBe(resolveToken(tokens, "--primary", DARK))
    for (const theme of [LIGHT, DARK]) {
      expect(resolveToken(written, "--button-secondary-bg", theme)).toBe(
        resolveToken(tokens, "--inverse", theme),
      )
    }
    expect(resolveToken(written, "--secondary", DARK)).toBe(
      resolveToken(tokens, "--neutral-700", DARK),
    )
    expect(resolveToken(written, "--secondary", LIGHT)).toBe(
      resolveToken(tokens, "--secondary", LIGHT),
    )
    expect(resolveToken(tokens, "--secondary", DARK)).toBe("#262626")
  })

  it("writes one .dark declaration for a light and a dark edit of a token without one", () => {
    const edits: TokenEdit[] = [
      { token: "--primary", scope: LIGHT, to: "var(--violet-600)" },
      { token: "--primary", scope: DARK, to: "var(--violet-400)" },
    ]
    const { tokens: written, written: plan } = rebuilt(edits)
    const css = [...plan.files.values()].join("\n")
    expect(css.match(/--primary:/g)).toHaveLength(2)
    expect(plan.changes.filter((change) => change.block === DARK)).toEqual([
      expect.objectContaining({ token: "--primary", from: undefined, to: "var(--violet-400)" }),
    ])
    expect(resolveToken(written, "--primary", LIGHT)).toBe(
      resolveToken(tokens, "--violet-600", LIGHT),
    )
    expect(resolveToken(written, "--primary", DARK)).toBe(
      resolveToken(tokens, "--violet-400", DARK),
    )
  })

  it("keeps a dark edit when a light edit of the same token follows it", () => {
    const overlay = rebuilt([
      { token: "--primary", scope: DARK, to: "var(--violet-400)" },
      { token: "--primary", scope: LIGHT, to: "var(--violet-600)" },
    ]).tokens
    expect(resolveToken(overlay, "--primary", DARK)).toBe(
      resolveToken(tokens, "--violet-400", DARK),
    )
    expect(resolveToken(overlay, "--primary", LIGHT)).toBe(
      resolveToken(tokens, "--violet-600", LIGHT),
    )
  })
})

describe("display", () => {
  it.each([
    ["calc(var(--spacing) * 4)", { kind: "length", px: 16 }],
    ["calc(var(--spacing) * 1.5)", { kind: "length", px: 6 }],
    ["var(--radius-md)", { kind: "name", text: "md" }],
    ["var(--radius-control)", { kind: "name", text: "xs" }],
    ["var(--secondary)", { kind: "color", css: "#f5f5f5" }],
    ["var(--chip-bg)", { kind: "color", css: expect.stringMatching(/^color-mix\(/) }],
    ["var(--radius-none)", { kind: "length", px: 0 }],
    ["auto", { kind: "raw", text: "auto" }],
  ] as const)("reads %s", (value, display) => {
    expect(displayOf(tokens, value, LIGHT)).toEqual(display)
  })
})

describe("preview", () => {
  const edit = { token: "--secondary", scope: DARK, to: "var(--neutral-700)" } as const

  it("covers the page by the root's theme", () => {
    expect(previewCss(tokens.themes, [edit], "page")).toBe(
      ".dark { --secondary: var(--neutral-700) !important; }",
    )
  })

  it("scopes a theme edit to stages of that theme, by their own class or the root's", () => {
    expect(previewCss(tokens.themes, [edit], { within: ".after" })).toBe(
      ".after.dark, :root.dark .after:not(.light), .after .dark { --secondary: var(--neutral-700) !important; }",
    )
  })
})
