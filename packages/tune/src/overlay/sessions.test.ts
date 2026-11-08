// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { type Event, initial, reduce, type State } from "./model"
import { ids, page, path, pending, ready, session } from "./session-fixtures"
import { holdersOf, type NewPin, pinned, progressOf, statusOf } from "./sessions"

const pinOf = (
  id: (typeof ids)[keyof typeof ids],
  name: string,
  n: number | null = null,
): NewPin => ({
  id,
  n,
  name,
  words: "Make it calmer",
  file: `${name.toLowerCase()}.tsx`,
  picked: [],
  baseline: null,
})
const run = (...events: Event[]) => events.reduce(reduce, { ...initial, open: true } as State)
const numbers = (state: State) => pinned(state.sessions).map(({ pin }) => `${pin.n} ${pin.name}`)

describe("pins", () => {
  it("numbers asks in order and keeps a sent ask through a poll that crossed it", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "page", page: page() },
      { kind: "asked", pin: pinOf(ids.button, "Button") },
    )
    expect(numbers(state)).toEqual(["1 Hero", "2 Button"])
  })

  it("drops a pin once the page stops listing its session", () => {
    const both = page(
      session(ids.hero, { kind: "original" }),
      session(ids.button, { kind: "original" }),
    )
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "asked", pin: pinOf(ids.button, "Button") },
      { kind: "page", page: both },
      { kind: "card", id: ids.hero },
      { kind: "page", page: page(session(ids.button, { kind: "original" })) },
    )
    expect(numbers(state)).toEqual(["2 Button"])
    expect(state.sessions.card).toBeNull()
  })

  it("asking closes the composer and the selection so the next ask can start", () => {
    const element = document.createElement("div")
    const state = run(
      { kind: "selected", element },
      { kind: "ask", target: { kind: "element", element }, words: "", tool: null },
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
    )
    expect(state.composer).toBeNull()
    expect(state.selection).toEqual({ kind: "none" })
  })

  it("keeps the pin's number through a refine round", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "asked", pin: pinOf(ids.button, "Button") },
      { kind: "card", id: ids.hero },
      { kind: "refining", id: ids.hero, words: "warmer" },
      { kind: "refined", from: ids.hero, id: ids.card, words: "warmer" },
    )
    expect(numbers(state)).toEqual(["1 Hero", "2 Button"])
    expect(state.sessions.card).toBe(ids.card)
    expect(state.sessions.pins[ids.card]).toMatchObject({ refine: "", words: "warmer" })
  })

  it("rejoins sessions after a reload with their stored numbers, numbering the rest after them", () => {
    const state = run({
      kind: "rejoined",
      pins: [pinOf(ids.button, "Button", 4), pinOf(ids.hero, "Hero")],
    })
    expect(numbers(state)).toEqual(["4 Button", "5 Hero"])
  })

  it("cycles cards with [ and ] in pin order, and opening one clears the selection", () => {
    const element = document.createElement("div")
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "asked", pin: pinOf(ids.button, "Button") },
      { kind: "selected", element },
      { kind: "cycled", by: -1 },
    )
    expect(state.sessions.card).toBe(ids.button)
    expect(state.selection).toEqual({ kind: "none" })
    expect(reduce(state, { kind: "cycled", by: 1 }).sessions.card).toBe(ids.hero)
  })

  it("selecting an element closes the card, and Esc closes the card before the selection", () => {
    const element = document.createElement("div")
    const opened = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "card", id: ids.hero },
    )
    expect(reduce(opened, { kind: "selected", element }).sessions.card).toBeNull()
    expect(reduce(opened, { kind: "escape" }).sessions.card).toBeNull()
  })

  it("keeps pins and page views while the overlay is closed", () => {
    const closed = run({ kind: "asked", pin: pinOf(ids.hero, "Hero") }, { kind: "toggled" })
    const polled = reduce(closed, {
      kind: "page",
      page: page(session(ids.hero, { kind: "original" })),
    })
    expect(polled.open).toBe(false)
    expect(numbers(polled)).toEqual(["1 Hero"])
    expect(numbers(reduce(polled, { kind: "toggled" }))).toEqual(["1 Hero"])
  })

  it("drops a refused ask with a notice", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "dropped", id: ids.hero, text: "Could not plan variants" },
    )
    expect(numbers(state)).toEqual([])
    expect(state.sessions.notice).toMatchObject({ text: "Could not plan variants", tone: "warn" })
  })
})

describe("reading a session", () => {
  it("builds the ring from each variant's phase", () => {
    const view = session(ids.hero, { kind: "original" }, [
      ready("v1"),
      pending("v2", "agent"),
      pending("v3", "queued"),
    ])
    expect(progressOf(view)).toBeCloseTo((1 + 0.4 + 0.04) / 3)
    expect(statusOf(view)).toEqual({ label: "1/3", tone: "plain" })
  })

  it("names the shown letter, a wait, and a conflict", () => {
    expect(statusOf(session(ids.hero, { kind: "shown", variant: "v2", edited: false }))).toEqual({
      label: "B",
      tone: "on",
    })
    const hold = { session: ids.hero, variant: "v1" as const, files: [path("app/hero.tsx")] }
    expect(
      statusOf(session(ids.button, { kind: "waiting", variant: "v3", on: [hold] })).label,
    ).toBe("waits C")
    expect(
      statusOf(
        session(ids.hero, {
          kind: "conflict",
          want: "original",
          files: [path("app/hero.tsx")],
          showing: "v1",
        }),
      ).tone,
    ).toBe("warn")
  })

  it("names who a waiting session waits for, and on which files", () => {
    const state = run({ kind: "asked", pin: pinOf(ids.hero, "Hero") })
    const hold = {
      session: ids.hero,
      variant: "v1" as const,
      files: [path("app/(marketing)/hero.tsx")],
    }
    expect(holdersOf([hold], state.sessions.pins)).toBe("#1 Hero · hero.tsx")
  })
})
