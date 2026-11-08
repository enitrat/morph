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

it("deduplicates mixed default and named exports without offering a default-only named import", () => {
  expect(
    moduleNames(`export function Button(){return <button/>}; export default Button`, new Set()),
  ).toMatchObject({ exports: ["Button"], namedExports: ["Button"] })
  expect(moduleNames(`function Button(){}; export default Button`, new Set())).toMatchObject({
    exports: ["Button"],
    namedExports: [],
  })
})

it("reads numeric and statically computed CVA keys", async () => {
  const { cvaVariants } = await import("./source")
  const text = `
    const styles = cva('', { variants: { columns: { 1: 'grid-cols-1', 2: 'grid-cols-2', ['3']: 'grid-cols-3', [dynamic]: 'unknown' } }, defaultVariants: { columns: 1 } })
    export function Grid(props: VariantProps<typeof styles>) { return <div /> }
  `
  expect(cvaVariants(text, "Grid")).toEqual([
    { name: "columns", options: ["1", "2", "3"], fallback: "1" },
  ])
})
