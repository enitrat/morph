import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cvaControls } from "./cva"

const UI = join(import.meta.dirname, "../bridge/fixtures/shadcn-dash/src/components/ui")
const source = (name: string) => readFileSync(join(UI, name), "utf8")

describe("cva prop controls", () => {
  it("reads each variant of the cva a component's props type names, with its default", () => {
    expect(cvaControls(source("button.tsx"), "Button")).toEqual([
      {
        kind: "enum",
        name: "variant",
        options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
        default: "default",
      },
      {
        kind: "enum",
        name: "size",
        options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
        default: "default",
      },
    ])
  })

  it("reads none for a name that reads no cva", () => {
    expect(cvaControls(source("button.tsx"), "buttonVariants")).toEqual([])
    expect(cvaControls(source("badge.tsx"), "Button")).toEqual([])
  })

  it("makes a true/false variant a switch and leaves out one with no default", () => {
    const text = `const toggleVariants = cva("base", {
  variants: { pressed: { true: "a", false: "b" }, tone: { calm: "c", loud: "d" } },
  defaultVariants: { pressed: false },
})
function Toggle(props: VariantProps<typeof toggleVariants>) {}`
    expect(cvaControls(text, "Toggle")).toEqual([
      { kind: "boolean", name: "pressed", default: false },
    ])
  })
})

it("keeps controls when comments and an aliased cva import appear in the source", () => {
  const text = `import { cva as variants } from "class-variance-authority"
const styles = variants("base", {
  // styles
  variants: { tone: { quiet: "a", loud: "b" } },
  /* default */ defaultVariants: { tone: "quiet" },
})
export function Button(props: VariantProps<typeof styles>) {}`
  expect(cvaControls(text, "Button")).toEqual([
    { kind: "enum", name: "tone", options: ["quiet", "loud"], default: "quiet" },
  ])
})

it("offers numeric variant options and their default as strings", () => {
  const text = `const styles = cva('', { variants: { columns: { 1: 'grid-cols-1', 2: 'grid-cols-2' } }, defaultVariants: { columns: 1 } })
export function Grid(props: VariantProps<typeof styles>) { return <div /> }`
  expect(cvaControls(text, "Grid")).toEqual([
    { kind: "enum", name: "columns", options: ["1", "2"], default: "1" },
  ])
})
