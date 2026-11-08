import { expect, it } from "vitest"

import { moduleNames } from "./source"

it("reads indented exports, aliases, default declarations and value imports", () => {
  const text = `
    import { Button as Action, type ButtonProps } from "./button"
    export function Card() {}
    export const Tile = () => null
    export { Action as Button }
    export default function Panel() {}`
  expect(moduleNames(text, new Set())).toEqual({
    exports: ["Card", "Tile", "Button", "Panel"],
    namedExports: ["Card", "Tile", "Button"],
    imports: ["Button"],
  })
})

it("counts aliased JSX imports, excluding comments and type-only imports", async () => {
  const { componentUseCount } = await import("./source")
  expect(
    componentUseCount(
      `import { Button as Action } from "./button"
// <Action />
const Demo = () => <><Action /><Action /></>`,
      "Button",
      false,
    ),
  ).toBe(2)
  expect(
    componentUseCount(
      `import type { Button } from "./button"\nconst Demo = () => <Button />`,
      "Button",
      false,
    ),
  ).toBe(0)
})
