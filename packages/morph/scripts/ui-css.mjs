import { compile, optimize } from "@tailwindcss/node"
import { Scanner } from "@tailwindcss/oxide"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"

const INPUT = resolve(import.meta.dirname, "../src/overlay/ui/tailwind.css")
const GEIST = join(dirname(createRequire(import.meta.url).resolve("geist/font")), "fonts")

/** Compiles the overlay's Tailwind stylesheet into the CSS string its shadow root injects. */
export async function uiCss() {
  const compiler = await compile(await readFile(INPUT, "utf8"), {
    base: dirname(INPUT),
    from: INPUT,
    onDependency: () => {},
  })
  const scanner = new Scanner({ sources: compiler.sources })
  return optimize(forShadowRoot(compiler.build(scanner.scan())), { minify: true }).code
}

/**
 * Shadow trees ignore `@property`, so the `--tw-*` variables that shadow, ring and transform
 * utilities compose would be unset unless the host page happens to register them. Tailwind already
 * emits their initial values on `*` for browsers without `@property`; this drops the `@supports`
 * gate around that block so every engine gets them, and drops the inert `@property` rules.
 */
function forShadowRoot(css) {
  if (/inherits: true/.test(css))
    throw new Error("ui-css: an inheriting @property needs a :host initial, not *")
  const gate = /(@layer properties \{\n)  @supports [^\n]+ \{\n([\s\S]*?)\n  \}\n\}/
  if (css.includes("@property") && !gate.test(css))
    throw new Error("ui-css: Tailwind's @property fallback changed shape")
  return css.replace(gate, "$1$2\n}").replace(/@property [^{]+\{[^}]*\}\n?/g, "")
}

/** Geist as data URLs, registered on the document by the widget since shadow trees ignore @font-face. */
export async function uiFonts() {
  const dataUrl = async (file) =>
    `data:font/woff2;base64,${(await readFile(join(GEIST, file))).toString("base64")}`
  return {
    sans: await dataUrl("geist-sans/Geist-Variable.woff2"),
    mono: await dataUrl("geist-mono/GeistMono-Variable.woff2"),
  }
}
