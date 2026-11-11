import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, it } from "vitest"

import { impactOf } from "../core/impact"
import { readDesignSystem, readImportable } from "./design-system"
import { CONFIG, REPO, repoCatalog } from "./test-fixtures"

it("offers the repo's named component imports even without token sources", () => {
  const config = { ...CONFIG, tokens: { ...CONFIG.tokens, files: ["missing/**/*.css"] } }
  expect(readImportable(REPO, config)).toEqual([
    { specifier: "@acme/ui", names: ["Badge", "Button", "Card"] },
  ])
})

it("counts a token's impact through components that render it, excluding unrelated components", () => {
  const { tokens, components } = repoCatalog()
  const reached = components.filter((component) =>
    impactOf(tokens.graph, "--button-px-md", [component]),
  )
  expect(reached.map((component) => component.slug).sort()).toEqual(["button", "order-summary"])
})

it.each([
  ["export default function Button() { return <button /> }", ["Button"], []],
  ["function Button() {}; export default Button", ["Button"], []],
  ["export function Button(){return <button/>}; export default Button", ["Button"], ["Button"]],
  [
    `
    import { Button as Action, type ButtonProps } from "./button"
    export function Card() {}
    export const Tile = () => null
    export { Action as Button }
    export default function Panel() {}`,
    ["Card", "Tile", "Button", "Panel"],
    ["Card", "Tile", "Button"],
  ],
])("discovers components and offers only valid named imports from %s", (source, names, imports) => {
  const root = mkdtempSync(join(tmpdir(), "morph-imports-"))
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
  try {
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src/button.tsx"), source)
    expect(readDesignSystem(root, config).components[0]?.exports).toEqual(names)
    expect(readImportable(root, config)).toEqual([{ specifier: "@ui/button", names: imports }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
