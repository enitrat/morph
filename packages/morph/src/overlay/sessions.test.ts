// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { type Event, initial, reduce, type State } from "./model"
import { ids, page, session } from "./session-fixtures"
import { type NewPin, pinned } from "./sessions"

const pinOf = (id: (typeof ids)[keyof typeof ids], name: string): NewPin => ({
  id,
  n: null,
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

  it("never gives a kept session's number to the next ask", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "asked", pin: pinOf(ids.button, "Button") },
      {
        kind: "page",
        page: page(
          session(ids.hero, { kind: "original" }),
          session(ids.button, { kind: "original" }),
        ),
      },
      { kind: "page", page: page(session(ids.hero, { kind: "original" })) },
      { kind: "asked", pin: pinOf(ids.card, "Card") },
    )
    expect(numbers(state)).toEqual(["1 Hero", "3 Card"])
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

  it("drops a refused ask with a notice", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "dropped", id: ids.hero, text: "Could not plan variants" },
    )
    expect(numbers(state)).toEqual([])
    expect(state.sessions.notice).toMatchObject({ text: "Could not plan variants", tone: "warn" })
  })
})
