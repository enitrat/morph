import { describe, expect, it } from "vitest"

import { type Event, initial, reduce, type State } from "./model"

const run = (...events: Event[]) => events.reduce(reduce, initial)
const open = (...events: Event[]) => run({ kind: "toggled" }, ...events)

const card = {} as Element
const button = {} as Element
const frame = {
  rect: { left: 0, top: 0, width: 400, height: 300 },
  items: [card, button],
  narrow: null,
}

describe("opening Morph", () => {
  it("ignores everything until Morph is open", () => {
    expect(run({ kind: "selected", element: card })).toBe(initial)
  })

  it("forgets the selection and inspector when it closes", () => {
    const state = open(
      { kind: "selected", element: card },
      { kind: "inspector" },
      { kind: "toggled" },
    )
    expect(state).toEqual(initial)
  })
})

describe("the inspector", () => {
  it("opens on a tab with its key and closes when the key is pressed again", () => {
    const specs = open({ kind: "tabKey", tab: "specs" })
    expect(specs.sidebar).toMatchObject({ kind: "open", tab: "specs" })
    expect(reduce(specs, { kind: "tabKey", tab: "morph" }).sidebar).toMatchObject({
      kind: "open",
      tab: "morph",
    })
    expect(reduce(specs, { kind: "tabKey", tab: "specs" }).sidebar.kind).toBe("closed")
  })

  it("keeps the side and width it docked at across tab changes", () => {
    const state = open(
      { kind: "inspector" },
      { kind: "docked", side: "left", width: 280 },
      { kind: "tab", tab: "morph" },
    )
    expect(state.sidebar).toEqual({
      kind: "open",
      tab: "morph",
      side: "left",
      width: 280,
      auto: false,
    })
  })

  it("opens on Specs for a frame and closes with it", () => {
    const framed = open({ kind: "framed", frame })
    expect(framed.sidebar).toMatchObject({ kind: "open", tab: "specs", auto: true })
    expect(reduce(framed, { kind: "escape" }).sidebar.kind).toBe("closed")
  })

  it("stays open after the frame when the designer took it over", () => {
    const state = open({ kind: "framed", frame }, { kind: "tab", tab: "morph" }, { kind: "escape" })
    expect(state.selection.kind).toBe("none")
    expect(state.sidebar).toMatchObject({ kind: "open", tab: "morph" })
  })

  it("stays open when a component is picked from the frame", () => {
    const state = open({ kind: "framed", frame }, { kind: "selected", element: card })
    expect(state.selection).toEqual({ kind: "element", element: card })
    expect(state.sidebar).toMatchObject({ kind: "open", auto: false })
  })
})

describe("hover", () => {
  it("keeps a hover the inspector set when the pointer leaves the page for it", () => {
    const sheet = { via: "sheet", elements: [card] } as const
    const state = open(
      { kind: "hovered", hover: { via: "page", element: card } },
      { kind: "hovered", hover: sheet },
      { kind: "pageLeft" },
    )
    expect(state.hover).toBe(sheet)
    expect(
      open({ kind: "hovered", hover: { via: "page", element: card } }, { kind: "pageLeft" }).hover,
    ).toBeNull()
  })
})

describe("frames", () => {
  it("narrows to one kind of component and widens again on a second click", () => {
    const narrowed = open({ kind: "framed", frame }, { kind: "narrowed", name: "Card" })
    expect(narrowed.selection).toMatchObject({ kind: "frame", frame: { narrow: "Card" } })
    expect(reduce(narrowed, { kind: "narrowed", name: "Card" }).selection).toMatchObject({
      frame: { narrow: null },
    })
  })
})

describe("the composer", () => {
  const asking = open(
    { kind: "selected", element: card },
    { kind: "ask", target: { kind: "element", element: card }, words: "", tool: null },
  )

  it("holds the words and marks of the draft", () => {
    const mark = {
      kind: "note",
      key: 1,
      snapped: "Card",
      at: { x: 0, y: 0 },
      element: card,
      text: "",
    } as const
    const state = [
      { kind: "typed", words: "More air" },
      { kind: "marked", mark },
      { kind: "relabeled", key: 1, text: "here" },
    ].reduce<State>((now, event) => reduce(now, event as Event), asking)
    expect(state.composer?.draft).toEqual({ words: "More air", marks: [{ ...mark, text: "here" }] })
    expect(reduce(state, { kind: "unmarked", key: 1 }).composer?.draft.marks).toEqual([])
  })

  it("closes when another element is selected", () => {
    expect(reduce(asking, { kind: "selected", element: button }).composer).toBeNull()
  })
})

describe("Esc", () => {
  it("backs out one layer at a time", () => {
    let state = open(
      { kind: "inspector" },
      { kind: "selected", element: card },
      { kind: "ask", target: { kind: "element", element: card }, words: "", tool: "box" },
    )
    const layers: string[] = []
    for (let i = 0; i < 5; i++) {
      state = reduce(state, { kind: "escape" })
      layers.push(
        [
          state.composer?.tool ?? "-",
          state.composer ? "composer" : "-",
          state.selection.kind,
          state.sidebar.kind,
        ].join(" "),
      )
    }
    expect(layers).toEqual([
      "- composer element open",
      "- - element open",
      "- - none open",
      "- - none closed",
      "- - none closed",
    ])
  })

  it("widens a narrowed frame before clearing it", () => {
    const state = open(
      { kind: "framed", frame },
      { kind: "narrowed", name: "Card" },
      { kind: "escape" },
    )
    expect(state.selection).toMatchObject({ kind: "frame", frame: { narrow: null } })
  })
})
