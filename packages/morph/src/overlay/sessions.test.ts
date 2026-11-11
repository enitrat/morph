// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { PageView } from "../variant/model"
import { captureTarget } from "./pinned-targets"
import { type Event, initial, reduce, type State } from "./model"
import { ids, threads, page, session } from "./session-fixtures"
import { type NewPin, pinned } from "./sessions"

const pinOf = (id: (typeof ids)[keyof typeof ids], name: string): NewPin => ({
  id,
  n: null,
  name,
  words: "Make it calmer",
  file: `${name.toLowerCase()}.tsx`,
  targets: [],
})
const run = (...events: Event[]) => events.reduce(reduce, { ...initial, open: true } as State)
const numbers = (state: State) => pinned(state.sessions).map(({ pin }) => `${pin.n} ${pin.name}`)

describe("pins", () => {
  it("acknowledges a submitted ask without restoring it over a newer closed page", () => {
    const acknowledged = page(session(ids.hero, { kind: "original" }))
    const closed = page()
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "page", page: closed },
      { kind: "answered", thread: threads.hero, id: ids.hero, page: acknowledged },
    )
    expect(numbers(state)).toEqual([])
    expect(state.sessions.page).toBe(closed)
  })

  it("ignores an older page that arrives after an ask was acknowledged", () => {
    const earlier = page()
    const acknowledged = page(session(ids.hero, { kind: "original" }))
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "page", page: acknowledged },
      { kind: "page", page: earlier },
    )
    expect(numbers(state)).toEqual(["1 Hero"])
    expect(state.sessions.page).toBe(acknowledged)
  })

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
      {
        kind: "page",
        page: page(
          session(ids.hero, { kind: "original" }),
          session(ids.button, { kind: "original" }),
        ),
      },
      { kind: "card", id: threads.hero },
      { kind: "refining", id: threads.hero, words: "warmer" },
      {
        kind: "page",
        page: page(
          { ...session(ids.card, { kind: "original" }), thread: threads.hero, words: "warmer" },
          session(ids.button, { kind: "original" }),
        ),
      },
    )
    expect(numbers(state)).toEqual(["1 Hero", "2 Button"])
    expect(state.sessions.card).toBe(threads.hero)
    expect(state.sessions.pins[threads.hero]).toMatchObject({ refine: "" })
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
    expect(state.composer).toBeNull()
    expect(reduce(state, { kind: "cycled", by: 1 }).sessions.card).toBe(ids.hero)
  })

  it("selecting an element closes the card, and Esc closes the card before the selection", () => {
    const element = document.createElement("div")
    const opened = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "card", id: threads.hero },
    )
    expect(reduce(opened, { kind: "selected", element }).sessions.card).toBeNull()
    expect(reduce(opened, { kind: "escape" }).sessions.card).toBeNull()
  })

  it("drops a refused ask with a notice", () => {
    const state = run(
      { kind: "asked", pin: pinOf(ids.hero, "Hero") },
      { kind: "refused", thread: threads.hero, id: ids.hero, text: "Could not plan variants" },
    )
    expect(numbers(state)).toEqual([])
    expect(state.sessions.notice).toMatchObject({ text: "Could not plan variants", tone: "warn" })
  })
})

it("clears predecessor drafts but preserves target references when another tab advances the thread", () => {
  const target = captureTarget(document.createElement("div"))
  const state = run(
    { kind: "asked", pin: { ...pinOf(ids.hero, "Hero"), targets: [target] } },
    { kind: "page", page: page(session(ids.hero, { kind: "original" })) },
    { kind: "card", id: threads.hero },
    { kind: "refining", id: threads.hero, words: "Local draft" },
    {
      kind: "page",
      page: page({ ...session(ids.button, { kind: "original" }), thread: threads.hero }),
    },
  )
  expect(state.sessions.card).toBe(threads.hero)
  expect(state.sessions.pins[threads.hero]).toMatchObject({ n: 1, refine: "", targets: [target] })
})

it("rejects an ambiguous page instead of hiding one of two competing rounds", () => {
  expect(
    PageView.safeParse(
      page(session(ids.hero, { kind: "original" }), {
        ...session(ids.button, { kind: "original" }),
        thread: threads.hero,
      }),
    ).success,
  ).toBe(false)
})
