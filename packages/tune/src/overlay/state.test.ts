// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import { DARK, LIGHT } from "../bridge/test-fixtures"
import { ThemeName } from "../core/config"
import { SessionId, type SessionView } from "../variant/model"
import {
  askedTheme,
  canRefine,
  climbsOnArrow,
  type Event,
  initial,
  reduce,
  sendsOnEnter,
  shownOf,
  type State,
  unsettled,
} from "./state"

const ID = SessionId.parse("6f1c1f6e-3f0e-4f4e-9d2a-2b1f6c3d4e5f")
const run = (events: Event[], from: State = initial) => events.reduce(reduce, from)

const view = (states: ("pending" | "ready")[], live: SessionView["live"] = null): SessionView => ({
  id: ID,
  live,
  stuck: null,
  trail: [],
  variants: states.map((state, index) => {
    const id = (["v1", "v2", "v3"] as const)[index] ?? "v1"
    return state === "pending"
      ? { id, direction: { title: "Rows", description: "List rows." }, state, phase: "agent" }
      : {
          id,
          direction: { title: "Rows", description: "List rows." },
          state,
          title: "Rows",
          summary: "",
          files: [],
          stat: { add: 1, del: 0 },
        }
  }),
})

const THEMES = [LIGHT, DARK]

describe("the theme an ask is about", () => {
  it("is the one mode its words name", () => {
    expect(askedTheme("Make the secondary fill one step lighter in dark mode", THEMES)).toBe("dark")
    expect(askedTheme("light-mode only: softer border", THEMES)).toBe("light")
    expect(askedTheme("dark only, please", THEMES)).toBe("dark")
  })

  it("reads a theme whose name has words of its own", () => {
    const palettes = ["claude", "claude-dark"].map((name) => ThemeName.parse(name))
    expect(askedTheme("brighter in claude dark mode", palettes)).toBe("claude-dark")
    expect(askedTheme("claude theme: softer cards", palettes)).toBe("claude")
  })

  it("is none when the words name no mode, both, or only a shade", () => {
    expect(askedTheme("make the card darker", THEMES)).toBeNull()
    expect(askedTheme("a light touch on the shadow", THEMES)).toBeNull()
    expect(askedTheme("same in light mode and dark mode", THEMES)).toBeNull()
  })
})

describe("the overlay state machine", () => {
  it("opens pointing when nothing is picked, and on the words once something is", () => {
    const opened = run([{ kind: "toggled" }])
    expect(opened.stage).toMatchObject({ kind: "composing", tool: "point" })

    const picked = run(
      [{ kind: "picked", element: document.createElement("div"), add: false }, { kind: "toggled" }],
      opened,
    )
    expect(picked).toMatchObject({ open: false, stage: { tool: null } })
    expect(run([{ kind: "toggled" }], picked).stage).toMatchObject({ tool: null })
  })

  it("picks one target with a click and keeps pointing to add more with Shift", () => {
    const [a, b] = [document.createElement("div"), document.createElement("div")]
    const pointing = run([{ kind: "toggled" }, { kind: "tool", tool: "point" }])

    const added = run(
      [
        { kind: "picked", element: a, add: false },
        { kind: "tool", tool: "point" },
        { kind: "picked", element: b, add: true },
      ],
      pointing,
    )
    const replaced = run([{ kind: "picked", element: b, add: false }], added)

    expect(added.stage).toMatchObject({
      kind: "composing",
      tool: "point",
      draft: { targets: [a, b] },
    })
    expect(replaced.stage).toMatchObject({ kind: "composing", tool: null, draft: { targets: [b] } })
  })

  it("goes from asking to an open session, keeps the marks while it runs, and picks the kept page", () => {
    const mark = {
      kind: "note",
      key: 1,
      snapped: "body",
      at: { x: 0, y: 0 },
      element: document.body,
      text: "here",
    } as const
    const asking = run([
      { kind: "marked", mark },
      { kind: "typed", words: "rows" },
      { kind: "sent", id: ID, at: 0, picked: [], from: null },
    ])
    const open = run(
      [
        {
          kind: "joined",
          id: ID,
          view: view(["pending", "ready"]),
          at: 0,
          adopted: false,
          picked: [],
        },
      ],
      asking,
    )

    expect(open.stage).toMatchObject({ kind: "session", draft: { marks: [mark] } })
    expect(unsettled(open.stage)).toBe(true)
    const kept = document.createElement("div")
    // Still pointing, so the next click on the kept page picks instead of pressing it.
    expect(run([{ kind: "ended", kept: true, targets: [kept] }], open).stage).toEqual({
      kind: "composing",
      tool: "point",
      draft: { targets: [kept], marks: [], words: "" },
    })
    expect(run([{ kind: "ended", kept: false }], open).stage).toEqual({
      kind: "composing",
      tool: null,
      draft: { targets: [], marks: [mark], words: "rows" },
    })
    expect(run([{ kind: "ended", kept: false }], asking).stage).toEqual({
      kind: "composing",
      tool: null,
      draft: { targets: [], marks: [mark], words: "rows" },
    })
  })

  it("settles once no variant is pending, and reads the original as shown when no variant is live", () => {
    const open = run([
      { kind: "sent", id: ID, at: 0, picked: [], from: null },
      { kind: "joined", id: ID, view: view(["ready", "ready"]), at: 0, adopted: false, picked: [] },
    ])

    expect(unsettled(open.stage)).toBe(false)
    expect(shownOf(view(["ready"]))).toBe("original")
    expect(shownOf(view(["ready"], { variant: "v1", edited: false }))).toBe("v1")
  })

  it("returns an adopted session's draft when it ends, so the designer can send theirs", () => {
    const asking = run([
      { kind: "typed", words: "mine" },
      { kind: "sent", id: ID, at: 0, picked: [], from: null },
    ])
    const adopted = run(
      [
        { kind: "joined", id: ID, view: null, at: 0, adopted: true, picked: [] },
        { kind: "ended", kept: true, targets: [] },
      ],
      asking,
    )

    expect(adopted.stage).toMatchObject({ kind: "composing", draft: { words: "mine" } })
  })

  it("does not reopen a closed panel when a poll answers", () => {
    const open = run([
      { kind: "sent", id: ID, at: 0, picked: [], from: null },
      { kind: "joined", id: ID, view: null, at: 0, adopted: false, picked: [] },
      { kind: "closed" },
    ])

    expect(run([{ kind: "viewed", id: ID, view: view(["ready"]) }], open).open).toBe(false)
  })
})

describe("Enter", () => {
  const arrow = {
    kind: "arrow",
    key: 2,
    snapped: "Move ‘Your orders’ below ‘Top region’",
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    source: document.body,
    target: document.body,
    head: document.body,
    place: "after",
    level: 0,
  } as const

  it("makes variants from an arrow alone, with no words typed", () => {
    const drawn = run([
      { kind: "toggled" },
      { kind: "marked", mark: arrow },
      { kind: "tool", tool: null },
    ])
    expect(sendsOnEnter(drawn.stage)).toBe(true)
  })

  it("does nothing while Make variants is disabled, and picks instead while pointing", () => {
    expect(sendsOnEnter(run([{ kind: "toggled" }]).stage)).toBe(false)
    const pointing = run([
      { kind: "toggled" },
      { kind: "marked", mark: arrow },
      { kind: "tool", tool: "point" },
    ])
    expect(sendsOnEnter(pointing.stage)).toBe(false)
  })
})

describe("↑ and ↓ after a pick", () => {
  it("climb the pick while the words are empty, and move the caret once there are words", () => {
    const picked = run([
      { kind: "toggled" },
      { kind: "picked", element: document.createElement("div"), add: false },
    ])
    expect(climbsOnArrow(picked.stage)).toBe(true)
    expect(climbsOnArrow(run([{ kind: "typed", words: "rows" }], picked).stage)).toBe(false)
  })
})

describe("refining a variant", () => {
  const NEXT = SessionId.parse("0b8e2a4c-1d3f-4a5b-8c7d-9e0f1a2b3c4d")
  const showing = (live: "v1" | null) =>
    run([
      { kind: "typed", words: "list rows" },
      { kind: "sent", id: ID, at: 0, picked: [], from: null },
      {
        kind: "joined",
        id: ID,
        view: view(["ready", "pending"], live && { variant: live, edited: false }),
        at: 0,
        adopted: false,
        picked: [],
      },
    ])
  const note = {
    kind: "note",
    key: 7,
    snapped: "Revenue",
    at: { x: 0, y: 0 },
    element: document.body,
    text: "bigger",
  } as const

  it("opens on a ready variant only, edits its own words, and closes when another is shown", () => {
    const open = showing("v1")
    expect(run([{ kind: "refine", variant: "v2" }], open).stage).toBe(open.stage)

    const refining = run(
      [
        { kind: "refine", variant: "v1" },
        { kind: "typed", words: "bigger revenue" },
      ],
      open,
    )
    expect(refining.stage).toMatchObject({
      kind: "session",
      draft: { words: "list rows" },
      refining: { variant: "v1", draft: { words: "bigger revenue" } },
    })
    expect(canRefine(refining.stage)).toBe(true)
    expect(sendsOnEnter(refining.stage)).toBe(true)

    const flipped = run(
      [{ kind: "pending", pending: { kind: "show", choice: "original" }, at: 0 }],
      refining,
    )
    expect(flipped.stage).toMatchObject({ kind: "session", refining: null })
    expect(run([{ kind: "unrefine" }], refining).stage).toMatchObject({ refining: null })
  })

  it("waits for the variant to be shown before it can send", () => {
    const refining = run(
      [
        { kind: "refine", variant: "v1" },
        { kind: "typed", words: "bigger" },
      ],
      showing(null),
    )
    expect(canRefine(refining.stage)).toBe(false)
  })

  it("sends feedback and marks as a round about the kept round's targets", () => {
    const target = document.createElement("div")
    const asking = run(
      [
        { kind: "refine", variant: "v1" },
        { kind: "typed", words: "bigger revenue" },
        { kind: "marked", mark: note },
        {
          kind: "sent",
          id: NEXT,
          at: 5,
          picked: [{ element: target, at: { x: 1, y: 2 } }],
          from: { variant: "v1", title: "Rows" },
        },
      ],
      showing("v1"),
    )
    expect(asking.stage).toEqual({
      kind: "asking",
      id: NEXT,
      since: 5,
      picked: [{ element: target, at: { x: 1, y: 2 } }],
      from: { variant: "v1", title: "Rows" },
      draft: { targets: [target], marks: [note], words: "bigger revenue" },
    })
  })

  it("keeps the feedback through a failed refine, sends it again, and gives it back on Back", () => {
    const asking = run(
      [
        { kind: "refine", variant: "v1" },
        { kind: "typed", words: "bigger revenue" },
        { kind: "sent", id: NEXT, at: 0, picked: [], from: { variant: "v1", title: "Rows" } },
      ],
      showing("v1"),
    )
    const retry = {
      request: {
        from: ID,
        variant: "v1",
        ask: { id: NEXT, words: "bigger revenue", targets: [], marks: [], count: 3 },
      },
      from: { variant: "v1", title: "Rows" },
    } as const
    const failed = run([{ kind: "refused", message: "Kept v1. Could not plan", retry }], asking)
    expect(failed.stage).toMatchObject({ kind: "failed", retry, draft: { words: "bigger revenue" } })

    const again = run([{ kind: "sent", id: NEXT, at: 9, picked: [], from: retry.from }], failed)
    expect(again.stage).toMatchObject({ kind: "asking", id: NEXT, draft: { words: "bigger revenue" } })
    expect(run([{ kind: "back" }], failed).stage).toMatchObject({
      kind: "composing",
      draft: { words: "bigger revenue" },
    })
  })
})

it("inspection pins one target without adding marks or leaving the tool", () => {
  const element = document.createElement("button")
  const inspecting = run([{ kind: "toggled" }, { kind: "tool", tool: "inspect" }, { kind: "inspected", element }])
  expect(inspecting.stage).toMatchObject({ kind: "composing", tool: "inspect", draft: { targets: [element], marks: [] } })
  const withWords = reduce(inspecting, { kind: "typed", words: "Change this" })
  expect(sendsOnEnter(withWords.stage)).toBe(false)
  expect(reduce(inspecting, { kind: "tool", tool: null }).stage).toMatchObject({ tool: null, draft: { targets: [element] } })
  expect(reduce(initial, { kind: "inspected", element })).toBe(initial)
})
