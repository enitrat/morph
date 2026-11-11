import { describe, expect, it } from "vitest"

import { setAttribute } from "./jsx"
import { controlsOf } from "./props"

const FILE = [
  "export function Row({ tone, variant, ...rest }) {",
  "  return (",
  "    <Toolbar>",
  '      <Button size="sm" loading={false}>',
  "        Save",
  "      </Button>",
  '      <Button variant={tone === 1 ? "ghost" : "outline"} size={\'lg\'}>Edit</Button>',
  "      <Button variant={variant} {...rest} />",
  '      <Button {...rest} variant="ghost" disabled />',
  "    </Toolbar>",
  "  )",
  "}",
].join("\n")

const line = (text: string, at: number) => text.split("\n")[at - 1]
const set = (at: number, name: string, to: string | boolean | null) =>
  setAttribute(FILE, { line: at, col: 7 }, "Button", name, to)

describe("setting a prop at one call site", () => {
  it("writes booleans as JSX does: on as the bare name, off as {false}", () => {
    const on = set(4, "loading", true)
    if (!on.ok) throw new Error(on.reason)
    expect(line(on.text, 4)).toBe('      <Button size="sm" loading>')
    const off = set(9, "disabled", false)
    if (!off.ok) throw new Error(off.reason)
    expect(line(off.text, 9)).toBe('      <Button {...rest} variant="ghost" disabled={false} />')
  })

  it("reads a quoted string inside braces as a literal", () => {
    const replaced = set(7, "size", "md")
    if (!replaced.ok) throw new Error(replaced.reason)
    expect(line(replaced.text, 7)).toContain('size="md">Edit')
  })

  it("refuses an expression, a forwarded prop, a spread that can set it, and another tag", () => {
    expect(set(7, "variant", "ghost")).toMatchObject({ ok: false })
    expect(set(8, "variant", "ghost")).toMatchObject({ ok: false })
    expect(set(8, "size", "lg")).toMatchObject({ ok: false })
    expect(setAttribute(FILE, { line: 3, col: 5 }, "Button", "size", "lg")).toMatchObject({
      ok: false,
      reason: "the tag at 3:5 is <Toolbar>, not <Button>",
    })
    expect(set(4, "size", 'lg" onClick="x')).toMatchObject({ ok: false })
  })

  it("writes over a spread written before the prop", () => {
    const replaced = set(9, "variant", "outline")
    if (!replaced.ok) throw new Error(replaced.reason)
    expect(line(replaced.text, 9)).toBe('      <Button {...rest} variant="outline" disabled />')
  })
})

describe("the props a meta's controls offer", () => {
  it("offers nothing for another component of the meta's folder", () => {
    const meta = {
      component: "ActivityRow",
      controls: { size: { kind: "boolean", default: false } },
    }
    expect(controlsOf(meta, "ActivityStatusBadge")).toEqual([])
  })

  it("ignores unsupported controls and rejects malformed offered controls", () => {
    expect(
      controlsOf({ component: "Button", controls: { amount: { kind: "number" } } }, "Button"),
    ).toEqual([])
    const meta = { component: "Button", controls: { variant: { kind: "enum", options: [] } } }
    expect(() => controlsOf(meta, "Button")).toThrow()
    expect(() => controlsOf({ component: "Button", controls: ["variant"] }, "Button")).toThrow()
  })
})
