// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest"

import { operations } from "../protocol"
import { actionsOf } from "./ask"
import { connect, type WireReply } from "./bridge"
import { type Event, initial, reduce } from "./model"
import { ids, threads, page, session } from "./session-fixtures"
import { type NewPin } from "./sessions"

afterEach(() => document.body.replaceChildren())

it("acknowledges a delayed ask after a newer page has already closed its session", async () => {
  const element = document.createElement("section")
  document.body.append(element)
  Object.assign(element, {
    __reactFiber$test: {
      type: "section",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/hero.js:1:1` },
    },
  })
  const waiting: { reply: WireReply; resolve: (reply: WireReply) => void }[] = []
  connect(async ({ op, body }) => {
    if (op === "plumbing") return { status: 200, body: { plumbing: [] } }
    if (op === "locate")
      return { status: 200, body: { sources: [{ path: "app/hero.tsx", line: 1, col: 1 }] } }
    if (op === "ask") {
      const request = operations.ask.request.parse(body)
      const reply = { status: 200, body: page(session(request.id, { kind: "original" })) }
      return new Promise<WireReply>((resolve) => waiting.push({ reply, resolve }))
    }
    throw new Error(`Unexpected ${op}`)
  })
  let state = { ...initial, open: true }
  const dispatch = (event: Event) => {
    state = reduce(state, event)
  }
  const submitted = actionsOf(dispatch).ask({
    target: { kind: "element", element },
    words: "Calmer",
    marks: [],
  })
  await vi.waitFor(() => expect(waiting).toHaveLength(1))
  const delayed = waiting[0]
  if (delayed === undefined) throw new Error("No ask is waiting")
  const closed = page()
  dispatch({ kind: "page", page: closed })
  delayed.resolve(delayed.reply)
  await submitted
  expect(state.sessions.page).toEqual(closed)
  expect(state.sessions.pins).toEqual({})
})

it("keeps a closed session closed when an earlier poll finishes after keep", async () => {
  const pin: NewPin = {
    id: ids.hero,
    n: null,
    name: "Hero",
    words: "Calmer",
    file: "hero.tsx",
    targets: [],
  }
  const shown = page(session(ids.hero, { kind: "shown", variant: "v1", edited: false }))
  let state = reduce({ ...initial, open: true }, { kind: "asked", pin })
  state = reduce(state, { kind: "page", page: shown })
  const earlier = page(...shown.sessions)
  const kept = page()
  let release: (reply: WireReply) => void = () => {
    throw new Error("No poll is waiting")
  }
  connect(async ({ op }) => {
    if (op === "page")
      return new Promise<WireReply>((resolve) => {
        release = resolve
      })
    if (op === "keep") return { status: 200, body: kept }
    throw new Error(`Unexpected ${op}`)
  })
  const received: Event[] = []
  const actions = actionsOf((event) => {
    state = reduce(state, event)
    received.push(event)
  })
  const active = state.sessions.pins[threads.hero]
  if (active === undefined) throw new Error("Missing pin")
  actions.poll()
  actions.keep(active, session(ids.hero, { kind: "shown", variant: "v1", edited: false }), "v1")
  await vi.waitFor(() => expect(state.sessions.page).toEqual(kept))
  release({ status: 200, body: earlier })
  await vi.waitFor(() => expect(received.filter((event) => event.kind === "page")).toHaveLength(2))
  expect(state.sessions.page).toEqual(kept)
  expect(state.sessions.pins).toEqual({})
})
