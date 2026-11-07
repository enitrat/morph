import { describe, expect, it } from "vitest"

import { classesIn, swapClass } from "./jsx"

const FILE = [
  "export function Tile({ wide }) {",
  "  return (",
  "    <div",
  '      data-slot="tile"',
  '      className={cn("flex gap-2 p-4", wide ? "w-8" : "w-4")}',
  "      onClick={() => (wide > 1 ? go() : null)}",
  "    >",
  '      <span className="p-4 text-sm">x</span>',
  "    </div>",
  "  )",
  "}",
].join("\n")

const line = (text: string, at: number) => text.split("\n")[at - 1]

describe("swapping a class in one JSX tag", () => {
  it("swaps only inside the tag at the site, past a `>` inside an expression", () => {
    const swapped = swapClass(FILE, 3, 5, "p-4", "p-5")
    if (!swapped.ok) throw new Error(swapped.reason)
    expect(swapped.changed).toBe(true)
    expect(line(swapped.text, 5)).toContain('"flex gap-2 p-5"')
    expect(line(swapped.text, 8)).toContain('"p-4 text-sm"')
  })

  it("is a no-op when the tag already holds the step", () => {
    const once = swapClass(FILE, 3, 5, "p-4", "p-5")
    if (!once.ok) throw new Error(once.reason)
    expect(swapClass(once.text, 3, 5, "p-4", "p-5")).toEqual({
      ok: true,
      text: once.text,
      changed: false,
    })
  })

  it("refuses a class the tag does not write exactly once", () => {
    expect(swapClass(FILE, 8, 7, "p-3", "p-5")).toMatchObject({ ok: false })
    expect(swapClass(FILE.replace("gap-2", "p-4"), 3, 5, "p-4", "p-5")).toMatchObject({ ok: false })
  })

  it("refuses a site that is not the start of a tag", () => {
    expect(swapClass(FILE, 5, 7, "p-4", "p-5")).toMatchObject({ ok: false })
  })

  it("lists the classes the tag writes once, and not a class it repeats", () => {
    expect(classesIn(FILE, 8, 7)).toEqual(expect.arrayContaining(["p-4", "text-sm"]))
    expect(classesIn(FILE.replace("gap-2", "p-4"), 3, 5)).not.toContain("p-4")
  })
})
