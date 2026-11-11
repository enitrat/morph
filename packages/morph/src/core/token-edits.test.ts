import { describe, expect, it } from "vitest"

import { ThemeName } from "./config"
import { themeModelOf, type Tokens } from "./design-system"
import { buildTokens, chainOf, resolve, resolveToken } from "./graph"
import { normalizeValue, referencesOf } from "./css-value"
import { editError, prepareTokenEdits, type TokenEdit } from "./edit"

const light = ThemeName.parse("light")
const dark = ThemeName.parse("dark")
const themes = themeModelOf({
  shared: [":root"],
  list: [
    { name: light, selectors: [".light"] },
    { name: dark, selectors: [".dark"], fallback: light },
  ],
})
const tokensOf = (css: string) =>
  buildTokens([{ path: "tokens.css", css, tier: "semantic", owned: true }], themes)
const prepare = (tokens: Tokens, edits: readonly TokenEdit[]) => {
  const result = prepareTokenEdits(tokens, edits)
  if (!result.ok) throw new Error(result.detail)
  return result
}
const edit = (to: string): TokenEdit => ({ token: "--role", scope: "all", to })

it("resolves a ten-thousand-token chain without confusing length with cycles", () => {
  const declarations = Array.from(
    { length: 10000 },
    (_, index) => `--n${index}: ${index === 9999 ? "16px" : `var(--n${index + 1})`};`,
  ).join("\n")
  const tokens = tokensOf(`:root {${declarations}}`)
  expect(resolveToken(tokens, "--n0", light)).toBe("16px")
  expect(chainOf(tokens, "--n0", light)).toHaveLength(10000)
})

it("identifies cyclic components while allowing outer fallbacks and independent diamonds", () => {
  const tokens = tokensOf(
    ":root {--a: var(--b);--b: var(--a);--c: var(--a, blue);--p:16px;--q:var(--p);--r:var(--p);--s:calc(var(--q) + var(--r));}",
  )
  expect(resolve(tokens, "var(--a, red)", light)).toBe("red")
  expect(resolveToken(tokens, "--c", light)).toBe("blue")
  expect(resolveToken(tokens, "--s", light)).toBe("calc(16px + 16px)")
  expect(resolveToken(tokens, "--a", light)).toBe("var(--a)")
  expect(chainOf(tokens, "--a", light)).toEqual([])
})

it("reads fallback dependencies only when the primary value is unavailable", () => {
  const tokens = tokensOf(":root {--p:green;--a:var(--p,var(--a));--b:var(--a,red);}")
  expect(tokens.values.get(light)?.cycles.size).toBe(0)
  expect(resolveToken(tokens, "--b", light)).toBe("green")
})

it("selects dependencies per theme instead of merging mutually exclusive edges", () => {
  const tokens = tokensOf(".light {--a:var(--b);--b:red}.dark {--a:blue;--b:var(--a)}")
  expect(resolveToken(tokens, "--a", light)).toBe("red")
  expect(resolveToken(tokens, "--b", dark)).toBe("blue")
  expect(tokens.values.get(light)?.cycles.size).toBe(0)
  expect(tokens.values.get(dark)?.cycles.size).toBe(0)
})

it("treats absent theme declarations as unknown values instead of throwing", () => {
  const tokens = tokensOf(".dark {--a:red}")
  expect(resolveToken(tokens, "--a", light)).toBe("var(--a)")
  expect(resolve(tokens, "var(--a, rgb(0 0 0))", light)).toBe("rgb(0 0 0)")
  expect(resolve(tokens, "var(--missing,)", light)).toBe("")
})

it("parses dependencies without reading quoted text or changing string whitespace", () => {
  expect(referencesOf('"var(--fake)" /*var(--comment)*/ var( --a, rgb(var(--b) 0 0))')).toEqual([
    "--a",
    "--b",
  ])
  expect(normalizeValue('  "a  b"  var( --a ) ')).toBe('"a  b" var(--a)')
})

it.each(["var(--p", "var(--p))", "var(--p);color:red", "var(--p --q)"])(
  "refuses malformed edit %s",
  (to) => {
    expect(editError(tokensOf(":root {--p:red;--q:blue;--role:var(--p);}"), edit(to))).toBeDefined()
  },
)

it("rejects indirect and batch cycles before returning any files", () => {
  const tokens = tokensOf(":root {--p:red;--a:var(--b);--b:var(--p);}")
  expect(editError(tokens, { token: "--b", scope: "all", to: "var(--a)" })).toMatch(/cycle/)
  const prepared = prepareTokenEdits(tokens, [
    { token: "--a", scope: "all", to: "var(--p)" },
    { token: "--b", scope: "all", to: "var(--a)" },
    { token: "--a", scope: "all", to: "var(--b)" },
  ])
  expect(prepared).toMatchObject({ ok: false, index: 2, detail: expect.stringMatching(/cycle/) })
  expect(resolveToken(tokens, "--a", light)).toBe("red")
})

it("allows ordered changes to restore the original and makes a repeated edit a no-op", () => {
  const tokens = tokensOf(":root {--p:red;--q:blue;--role:var(--p);}")
  expect(prepare(tokens, [edit("var(--q)"), edit("var(--p)")]).files.size).toBe(0)
  expect(prepare(tokens, [edit("var(--p)")]).files.size).toBe(0)
  expect(
    resolveToken(prepare(tokens, [edit("var(--q)"), edit("var(--q)")]).tokens, "--role", light),
  ).toBe("blue")
})

it("does not block an independent edit because another source token is cyclic", () => {
  const tokens = tokensOf(":root {--a:var(--b);--b:var(--a);--p:red;--q:blue;--role:var(--p);}")
  expect(prepareTokenEdits(tokens, [edit("var(--q)")]).ok).toBe(true)
  expect(editError(tokens, edit("var(--a)"))).toMatch(/cycle/)
})

describe("shared parsed source", () => {
  it("reads direct theme declarations beside nested keyframes and ignores conditional/reference blocks", () => {
    const tokens = tokensOf(`@import "tailwindcss";
      @theme reference {--hidden:red;--role:bad;}
      @media screen { :root {--role:bad;} }
      @supports (display:grid) { :root {--role:bad;} }
      @container (width>100px) { :root {--role:bad;} }
      @theme { --role:var(--p); @keyframes bounce {from {transform:translateY(0)}to {transform:translateY(1px)}} --p:red; --q:blue; }
      @layer base { .dark {--role:var(--q)} }`)
    expect(tokens.graph.has("--hidden")).toBe(false)
    expect(resolveToken(tokens, "--role", light)).toBe("red")
    const prepared = prepare(tokens, [edit("var(--q)")])
    expect(resolveToken(prepared.tokens, "--role", light)).toBe("blue")
    const css = prepared.files.get("tokens.css") ?? ""
    expect(css).toContain("@theme reference {--hidden:red;--role:bad;}")
    expect(css).toContain("@media screen { :root {--role:bad;} }")
    expect(css).toContain(
      "@keyframes bounce {from {transform:translateY(0)}to {transform:translateY(1px)}}",
    )
  })

  it("writes the winning app declaration instead of an earlier default or duplicate", () => {
    const css =
      "@theme default {--role:red;--p:red;--q:blue;}\n@theme {--role:var(--p);--role:green;}"
    const result = prepare(tokensOf(css), [edit("var(--q)")])
    expect(result.files.get("tokens.css")).toBe(css.replace("--role:var(--p)", "--role:var(--q)"))
    expect(resolveToken(result.tokens, "--role", light)).toBe("blue")
  })

  it("preserves strings, comments, BOM, CRLF, important and semicolonless value boundaries", () => {
    const css =
      '\uFEFF:root {\r\n  --text: "} ; /* literal */";\r\n  --p: red;\r\n  --q: blue;\r\n  --role: /* before */ var(--p) /* after */ !important\r\n}\r\n'
    expect(resolveToken(tokensOf(css), "--text", light)).toBe('"} ; /* literal */"')
    const result = prepare(tokensOf(css), [edit("var(--q)")])
    expect(result.files.get("tokens.css")).toBe(css.replace("var(--p)", "var(--q)"))
  })

  it.each(["--untouched: var(--p)", "color: red"])(
    "inserts inherited-theme pins after semicolonless %s",
    (last) => {
      const css = `:root {--p:red;--q:blue}\n.light {--role:var(--p)}\n.dark { ${last} }`
      const result = prepare(tokensOf(css), [{ token: "--role", scope: light, to: "var(--q)" }])
      expect(resolveToken(result.tokens, "--role", light)).toBe("blue")
      expect(resolveToken(result.tokens, "--role", dark)).toBe("red")
      expect(result.files.get("tokens.css")).toContain(`${last};\n  --role: var(--p);`)
    },
  )

  it("keeps wildcard resets out of declarations and removes only matching defaults", () => {
    const tokens = tokensOf(
      "@theme default {--radius-sm:2px;--space:4px;} @theme {--radius-*:initial;--radius-lg:8px;}",
    )
    expect(tokens.graph.has("--radius-sm")).toBe(false)
    expect(resolveToken(tokens, "--radius-lg", light)).toBe("8px")
    expect(resolveToken(tokens, "--space", light)).toBe("4px")
  })
})

it("preserves URL source values and outer fallbacks around external dependencies", () => {
  const tokens = tokensOf(
    ":root {--image:url(data:image/svg+xml;base64,AAAA);--unknown:var(--external);--empty:INITIAL;}",
  )
  expect(resolve(tokens, "var(--image, red)", light)).toBe("url(data:image/svg+xml;base64,AAAA)")
  expect(resolve(tokens, "var(--unknown, red)", light)).toBe("var(--unknown, red)")
  expect(resolve(tokens, "var(--empty, red)", light)).toBe("red")
})

it("returns a refusal when a scoped edit has no effective declaration", () => {
  const tokens = tokensOf(":root {--p:red;--q:blue} .dark {--role:var(--p)}")
  expect(
    prepareTokenEdits(tokens, [{ token: "--role", scope: light, to: "var(--q)" }]),
  ).toMatchObject({ ok: false, detail: "--role has no light declaration" })
})

it("keeps substitution token boundaries and preserves unsupported source expressions", () => {
  const tokens = tokensOf(
    String.raw`:root {--number:1;--dimension:var(--number)px;--escaped:foo\;bar;--role:var(--escaped, fallback);}`,
  )
  expect(resolveToken(tokens, "--dimension", light)).toBe("1/**/px")
  expect(resolveToken(tokens, "--role", light)).toBe("var(--role)")
})

it("finds cycles in used fallbacks without accepting a cyclic member's own recovery", () => {
  const tokens = tokensOf(":root {--a:var(--missing,var(--b));--b:var(--a,red);--c:var(--a,blue);}")
  expect(resolveToken(tokens, "--a", light)).toBe("var(--a)")
  expect(resolveToken(tokens, "--b", light)).toBe("var(--b)")
  expect(resolveToken(tokens, "--c", light)).toBe("blue")
})

it("preserves declaration encounter order across nested utility themes", () => {
  const tokens = tokensOf(":root { @theme {--role:var(--q)} --role:var(--p);--p:red;--q:blue;}")
  expect(resolveToken(tokens, "--role", light)).toBe("blue")
})

it("allows an edit whose self reference is in an unused fallback", () => {
  const tokens = tokensOf(":root {--p:red;--role:blue;}")
  const result = prepare(tokens, [edit("var(--p,var(--role))")])
  expect(resolveToken(result.tokens, "--role", light)).toBe("red")
})

it("unwinds cyclic replacements before their unused fallback can capture an upstream token", () => {
  const tokens = tokensOf(
    ":root {--a:var(--b,blue);--b:var(--c,blue);--c:var(--d,var(--a));--d:var(--c,red);}",
  )
  expect(resolveToken(tokens, "--a", light)).toBe("blue")
  expect(resolveToken(tokens, "--b", light)).toBe("blue")
  expect(resolve(tokens, "var(--c,purple)", light)).toBe("purple")
})
