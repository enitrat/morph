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
  const advanced = (...events: Event[]) =>
    open({ kind: "tools", tools: ["specs", "tune"] }, ...events)

  it("stays shut until an advanced tab is turned on", () => {
    expect(open({ kind: "inspector" }).sidebar.kind).toBe("closed")
    expect(open({ kind: "tabKey", tab: "specs" }).sidebar.kind).toBe("closed")
    expect(open({ kind: "tools", tools: ["tune"] }, { kind: "inspector" }).sidebar).toMatchObject({
      kind: "open",
      tab: "tune",
    })
  })

  it("closes, or leaves a tab, when that tab is turned off", () => {
    const tuning = advanced({ kind: "tabKey", tab: "tune" })
    expect(reduce(tuning, { kind: "tools", tools: ["specs"] }).sidebar).toMatchObject({
      kind: "open",
      tab: "specs",
    })
    expect(reduce(tuning, { kind: "tools", tools: [] }).sidebar.kind).toBe("closed")
  })

  it("keeps the tools turned on across closing Morph", () => {
    expect(advanced({ kind: "toggled" }).tools).toEqual(["specs", "tune"])
  })

  it("opens on a tab with its key and closes when the key is pressed again", () => {
    const specs = advanced({ kind: "tabKey", tab: "specs" })
    expect(specs.sidebar).toMatchObject({ kind: "open", tab: "specs" })
    expect(reduce(specs, { kind: "tabKey", tab: "tune" }).sidebar).toMatchObject({
      kind: "open",
      tab: "tune",
    })
    expect(reduce(specs, { kind: "tabKey", tab: "specs" }).sidebar.kind).toBe("closed")
  })

  it("keeps the side and width it docked at across tab changes", () => {
    const state = advanced(
      { kind: "inspector" },
      { kind: "docked", side: "left", width: 280 },
      { kind: "tab", tab: "tune" },
    )
    expect(state.sidebar).toEqual({ kind: "open", tab: "tune", side: "left", width: 280 })
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

describe("picking", () => {
  it("opens the composer on the element", () => {
    expect(open({ kind: "selected", element: card }).composer).toEqual({
      target: { kind: "element", element: card },
      draft: { words: "", marks: [] },
      tool: null,
    })
  })

  it("starts a fresh draft on the next element", () => {
    const state = open(
      { kind: "selected", element: card },
      { kind: "typed", words: "More air" },
      { kind: "selected", element: button },
    )
    expect(state.composer).toMatchObject({
      target: { element: button },
      draft: { words: "" },
    })
  })

  it("narrows a frame to one kind of component and widens again on a second click", () => {
    const narrowed = open({ kind: "framed", frame }, { kind: "narrowed", name: "Card" })
    expect(narrowed.composer?.target).toMatchObject({ kind: "frame", frame: { narrow: "Card" } })
    expect(reduce(narrowed, { kind: "narrowed", name: "Card" }).composer?.target).toMatchObject({
      frame: { narrow: null },
    })
  })
})

describe("the composer", () => {
  const asking = open({ kind: "selected", element: card })

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
})

describe("Esc", () => {
  it("backs out one layer at a time", () => {
    let state = open(
      { kind: "tools", tools: ["specs"] },
      { kind: "inspector" },
      { kind: "selected", element: card },
      { kind: "tool", tool: "box" },
    )
    const layers: string[] = []
    for (let i = 0; i < 4; i++) {
      state = reduce(state, { kind: "escape" })
      layers.push(
        [state.composer?.tool ?? "-", state.composer ? "composer" : "-", state.sidebar.kind].join(
          " ",
        ),
      )
    }
    expect(layers).toEqual(["- composer open", "- - open", "- - closed", "- - closed"])
  })

  it("widens a narrowed frame before clearing it", () => {
    const state = open(
      { kind: "framed", frame },
      { kind: "narrowed", name: "Card" },
      { kind: "escape" },
    )
    expect(state.composer?.target).toMatchObject({ kind: "frame", frame: { narrow: null } })
  })
})
