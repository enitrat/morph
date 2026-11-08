import { compile, optimize } from "@tailwindcss/node"
import { Scanner } from "@tailwindcss/oxide"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const INPUT = resolve(import.meta.dirname, "../src/overlay/ui/tailwind.css")

/** Compiles the overlay's Tailwind stylesheet into the CSS string its shadow root injects. */
export async function uiCss() {
  const compiler = await compile(await readFile(INPUT, "utf8"), {
    base: dirname(INPUT),
    from: INPUT,
    onDependency: () => {},
  })
  const scanner = new Scanner({ sources: compiler.sources })
  return optimize(compiler.build(scanner.scan()), { minify: true }).code
}
