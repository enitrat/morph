import { describe, expect, it } from "vitest"

import { attributesIn, movedTag, setAttribute } from "./jsx"
import { controlsOf, resolveAt, writeOf } from "./props"

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
const set = (at: number, name: string, to: string | boolean | null, text = FILE) =>
  setAttribute(text, { line: at, col: 7 }, "Button", name, to)

describe("setting a prop at one call site", () => {
  it("replaces a literal, adds an absent prop, and leaves the other tags alone", () => {
    const replaced = set(4, "size", "lg")
    const added = set(4, "variant", "secondary")
    if (!replaced.ok || !added.ok) throw new Error("refused")
    expect(line(replaced.text, 4)).toBe('      <Button size="lg" loading={false}>')
    expect(line(added.text, 4)).toBe('      <Button variant="secondary" size="sm" loading={false}>')
    expect(line(added.text, 7)).toBe(line(FILE, 7))
  })

  it("writes booleans as JSX does: on as the bare name, off as {false}", () => {
    const on = set(4, "loading", true)
    if (!on.ok) throw new Error(on.reason)
    expect(line(on.text, 4)).toBe('      <Button size="sm" loading>')
    const off = set(9, "disabled", false)
    if (!off.ok) throw new Error(off.reason)
    expect(line(off.text, 9)).toBe('      <Button {...rest} variant="ghost" disabled={false} />')
  })

  it("removes the attribute for null, and an absent one is already done", () => {
    const removed = set(4, "size", null)
    if (!removed.ok) throw new Error(removed.reason)
    expect(line(removed.text, 4)).toBe("      <Button loading={false}>")
    expect(set(4, "press", null)).toEqual({ ok: true, text: FILE, changed: false })
    expect(set(4, "size", "sm")).toEqual({ ok: true, text: FILE, changed: false })
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

  it("finds the tag again after formatting moved it", () => {
    const after = FILE.replace("    <Toolbar>", "    <Toolbar>\n      {/* moved */}")
    expect(movedTag(FILE, after, { line: 8, col: 7 }, "Button")).toEqual({ line: 9, col: 7 })
  })
})

describe("what a call site says about a prop", () => {
  const attributes = (at: number) => attributesIn(FILE, at, 7)?.attributes ?? []

  it("edits a literal or an absent prop where no spread can set it", () => {
    expect(resolveAt(attributes(4), "size")).toEqual({ kind: "edit", written: "sm" })
    expect(resolveAt(attributes(4), "loading")).toEqual({ kind: "edit", written: false })
    expect(resolveAt(attributes(4), "variant")).toEqual({ kind: "edit", written: null })
    expect(resolveAt(attributes(9), "disabled")).toEqual({ kind: "edit", written: true })
  })

  it("climbs past a forwarded prop or a spread, and stops at an expression", () => {
    expect(resolveAt(attributes(8), "variant")).toEqual({ kind: "climb" })
    expect(resolveAt(attributes(8), "size")).toEqual({ kind: "climb" })
    expect(resolveAt(attributes(7), "variant")).toEqual({ kind: "code" })
  })
})

describe("the props a meta's controls offer", () => {
  it("keeps enum and boolean controls that reach the component", () => {
    const controls = controlsOf(
      {
        component: "Button",
        controls: {
          variant: { kind: "enum", options: ["primary", "ghost"], default: "primary" },
          loading: { kind: "boolean", default: false },
          leadingIcon: { kind: "boolean", label: "Leading icon", default: false, target: "none" },
          children: { kind: "text", default: "Save", target: "children" },
          amount: { kind: "number", default: 1, min: 0, max: 2 },
        },
      },
      "Button",
    )
    expect(controls).toEqual([
      { kind: "enum", name: "variant", options: ["primary", "ghost"], default: "primary" },
      { kind: "boolean", name: "loading", default: false },
    ])
  })

  it("offers nothing for another component of the meta's folder", () => {
    const meta = {
      component: "ActivityRow",
      controls: { size: { kind: "boolean", default: false } },
    }
    expect(controlsOf(meta, "ActivityStatusBadge")).toEqual([])
  })

  it("throws on a control that is not one", () => {
    const meta = { component: "Button", controls: { variant: { kind: "enum", options: [] } } }
    expect(() => controlsOf(meta, "Button")).toThrow()
    expect(() => controlsOf({ component: "Button", controls: ["variant"] }, "Button")).toThrow()
  })

  it("drops the attribute when the value is the default", () => {
    const [variant] = controlsOf(
      {
        component: "Button",
        controls: { variant: { kind: "enum", options: ["primary", "ghost"], default: "primary" } },
      },
      "Button",
    )
    if (variant === undefined) throw new Error("no control")
    expect(writeOf(variant, "primary")).toBeNull()
    expect(writeOf(variant, "ghost")).toBe("ghost")
  })
})
