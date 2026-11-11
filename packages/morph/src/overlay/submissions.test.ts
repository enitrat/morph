// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest"

import { operations } from "../protocol"
import { type Refine, type ThreadId } from "../variant/model"
import { actionsOf } from "./ask"
import { connect, type Transport, type WireReply } from "./bridge"
import { type Event, initial, reduce } from "./model"
import { captureTarget } from "./pinned-targets"
import { ids, page, session, threads } from "./session-fixtures"
import { forgetSubmission, readSessions, rememberSubmission } from "./session-store"
import { type Pin, submissionId } from "./sessions"

const located: WireReply = {
  status: 200,
  body: { sources: [{ path: "app/hero.tsx", line: 1, col: 1 }] },
}
const shown = session(ids.hero, { kind: "shown", variant: "v1", edited: false })
const offline = { status: 503, body: null }

function waitingReply() {
  let resolve: (reply: WireReply) => void = () => {
    throw new Error("Reply not initialized")
  }
  const promise = new Promise<WireReply>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function target() {
  const element = document.createElement("section")
  document.body.append(element)
  Object.assign(element, {
    __reactFiber$test: {
      type: "section",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/hero.js:1:1` },
    },
  })
  return element
}

function controller(transport: Transport, sessions = initial.sessions) {
  connect(async (call) => {
    if (call.op === "plumbing") return { status: 200, body: { plumbing: [] } }
    return transport(call)
  })
  let state = { ...initial, open: true, sessions }
  const dispatch = (event: Event) => {
    state = reduce(state, event)
  }
  const actions = actionsOf(dispatch)
  const pin = (thread: ThreadId = threads.hero): Pin => {
    const found = state.sessions.pins[thread]
    if (found === undefined) throw new Error("Missing thread")
    return found
  }
  const prepare = () => {
    dispatch({
      kind: "asked",
      pin: {
        id: ids.hero,
        n: null,
        name: "Hero",
        words: "Calmer",
        file: "hero.tsx",
        targets: [captureTarget(target())],
      },
    })
    dispatch({ kind: "page", page: page(shown) })
    dispatch({ kind: "refining", id: threads.hero, words: "More space" })
    return pin()
  }
  return { actions, dispatch, pin, prepare, state: () => state }
}

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

it("cancels an initial lookup without later sending or journaling it", async () => {
  const lookup = waitingReply()
  const posts: unknown[] = []
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return lookup.promise
    if (op === "discard") return { status: 200, body: page() }
    posts.push(body)
    return offline
  })
  const submitted = app.actions.ask({
    target: { kind: "element", element: target() },
    words: "Calmer",
    marks: [],
  })
  const pin = Object.values(app.state().sessions.pins)[0]
  if (pin === undefined) throw new Error("Missing new pin")
  app.actions.cancel(pin)
  await vi.waitFor(() => expect(app.state().sessions.pins).toEqual({}))
  lookup.resolve(located)
  await submitted
  expect(posts).toEqual([])
  expect(readSessions().pins).toEqual({})
})

it("releases a canceled refinement immediately and fences its delayed lookup", async () => {
  const lookup = waitingReply()
  const requests: Refine[] = []
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return lookup.promise
    if (op === "discard") return { status: 200, body: page(shown) }
    if (op === "refine") requests.push(operations.refine.request.parse(body))
    return offline
  })
  app.actions.refine(app.prepare(), shown, "v1")
  const canceled = app.pin().submission
  if (canceled === null) throw new Error("No pending refinement")
  app.actions.cancel(app.pin())
  await vi.waitFor(() => expect(app.pin().submission).toBeNull())
  app.dispatch({ kind: "refining", id: threads.hero, words: "Try again" })
  app.actions.refine(app.pin(), shown, "v1")
  lookup.resolve(located)
  await vi.waitFor(() => expect(app.pin().submission?.kind).toBe("uncertain"))
  expect(requests).toHaveLength(1)
  expect(requests[0]?.ask.words).toBe("Try again")
  expect(requests[0]?.ask.id).not.toBe(submissionId(canceled))
  expect(readSessions().pins[threads.hero]?.submission).toMatchObject({
    command: { request: requests[0] },
  })
})

it("fences a superseded lookup before it can replace the next round's journal", async () => {
  const firstLookup = waitingReply()
  let lookups = 0
  const requests: Refine[] = []
  const successor = { ...shown, id: ids.button }
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return ++lookups === 1 ? firstLookup.promise : located
    if (op === "page") return { status: 200, body: page(successor) }
    if (op === "refine") requests.push(operations.refine.request.parse(body))
    return offline
  })
  app.actions.refine(app.prepare(), shown, "v1")
  app.actions.poll()
  await vi.waitFor(() => expect(app.pin().submission).toBeNull())
  app.dispatch({ kind: "retargeted", id: threads.hero, matches: [captureTarget(target()).match] })
  app.dispatch({ kind: "refining", id: threads.hero, words: "New round" })
  app.actions.refine(app.pin(), successor, "v1")
  await vi.waitFor(() => expect(app.pin().submission?.kind).toBe("uncertain"))
  firstLookup.resolve(located)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(requests).toHaveLength(1)
  expect(requests[0]?.from).toBe(ids.button)
  expect(readSessions().pins[threads.hero]?.submission).toMatchObject({
    command: { request: requests[0] },
  })
})

it("persists before POST and replays the exact unresolved refinement after reload", async () => {
  const requests: Refine[] = []
  let recordedBeforePost = false
  const transport: Transport = async ({ op, body }) => {
    if (op === "locate") return located
    if (op === "refine") {
      const request = operations.refine.request.parse(body)
      requests.push(request)
      recordedBeforePost = readSessions().pins[threads.hero]?.submission?.kind === "uncertain"
      return requests.length === 1 ? offline : { status: 200, body: page() }
    }
    throw new Error(`Unexpected ${op}`)
  }
  const app = controller(transport)
  app.actions.refine(app.prepare(), shown, "v1")
  await vi.waitFor(() => expect(app.pin().submission?.kind).toBe("uncertain"))
  expect(recordedBeforePost).toBe(true)
  const restored = controller(transport, readSessions())
  const pending = restored.pin()
  restored.actions.resume(pending)
  restored.actions.resume(pending)
  await vi.waitFor(() => expect(restored.state().sessions.pins).toEqual({}))
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(readSessions().pins).toEqual({})
})

it("allows another refinement after polling confirms success while the old HTTP reply hangs", async () => {
  const delayed = waitingReply()
  const requests: Refine[] = []
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return located
    if (op === "refine") {
      requests.push(operations.refine.request.parse(body))
      return requests.length === 1 ? delayed.promise : offline
    }
    if (op === "page") {
      const first = requests[0]
      if (first === undefined) throw new Error("Missing accepted refinement")
      return { status: 200, body: page({ ...shown, id: first.ask.id }) }
    }
    throw new Error(`Unexpected ${op}`)
  })
  const stalePin = app.prepare()
  app.actions.refine(stalePin, shown, "v1")
  app.actions.refine(stalePin, shown, "v1")
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  app.actions.poll()
  await vi.waitFor(() => expect(app.pin().submission).toBeNull())
  const successor = app.state().sessions.page.sessions[0]
  if (successor?.kind !== "active") throw new Error("No successor")
  app.dispatch({ kind: "refining", id: threads.hero, words: "Next refinement" })
  app.actions.refine(app.pin(), successor, "v1")
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await vi.waitFor(() => expect(app.pin().submission?.kind).toBe("uncertain"))
  delayed.resolve({ status: 409, body: { error: { kind: "invalid", detail: "Old refusal" } } })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(app.pin().submission).toMatchObject({ command: { request: requests[1] } })
  expect(readSessions().pins[threads.hero]?.submission).toMatchObject({
    command: { request: requests[1] },
  })
  expect(app.state().sessions.notice?.text).not.toBe("Old refusal")
})

it("ignores corrupt journal entries and preserves a later command when forgetting an old one", async () => {
  const app = controller(async () => offline)
  const pin = app.prepare()
  const request = {
    from: ids.hero,
    variant: "v1" as const,
    ask: { id: ids.button, words: "Space", targets: shown.targets, marks: [], count: 3 as const },
  }
  expect(rememberSubmission(pin, { op: "refine", request })).toBe(true)
  sessionStorage.setItem("morph:submission:broken", "{")
  expect(readSessions().pins[threads.hero]?.submission).toMatchObject({ command: { request } })
  const next = { ...request, ask: { ...request.ask, id: ids.card } }
  rememberSubmission(pin, { op: "refine", request: next })
  forgetSubmission(ids.button)
  expect(readSessions().pins[threads.hero]?.submission).toMatchObject({
    command: { request: next },
  })
  forgetSubmission(ids.card)
  expect(readSessions().pins).toEqual({})
})

it("recovers an initial ask after its accepted response was lost and the round already closed", async () => {
  const requests: unknown[] = []
  const transport: Transport = async ({ op, body }) => {
    if (op === "locate") return located
    if (op === "ask") {
      requests.push(body)
      return requests.length === 1 ? offline : { status: 200, body: page() }
    }
    throw new Error(`Unexpected ${op}`)
  }
  const app = controller(transport)
  await app.actions.ask({
    target: { kind: "element", element: target() },
    words: "Calmer",
    marks: [],
  })
  const restored = controller(transport, readSessions())
  const pin = Object.values(restored.state().sessions.pins)[0]
  if (pin === undefined) throw new Error("No restored ask")
  expect(pin.submission?.kind).toBe("uncertain")
  restored.actions.resume(pin)
  await vi.waitFor(() => expect(restored.state().sessions.pins).toEqual({}))
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(readSessions().pins).toEqual({})
})

it("keeps the live outcome usable when browser storage is unavailable", async () => {
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return located
    if (op === "ask") {
      const request = operations.ask.request.parse(body)
      return { status: 200, body: page(session(request.id, { kind: "original" })) }
    }
    throw new Error(`Unexpected ${op}`)
  })
  const storage = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new Error("Storage disabled")
  })
  try {
    expect(readSessions().pins).toEqual({})
    await app.actions.ask({
      target: { kind: "element", element: target() },
      words: "Calmer",
      marks: [],
    })
    expect(app.state().sessions.page.sessions).toHaveLength(1)
    expect(Object.values(app.state().sessions.pins)[0]?.submission).toBeNull()
    expect(app.state().sessions.notice?.text).toContain("could not save request recovery")
  } finally {
    storage.mockRestore()
  }
})

it("revokes unfinished lookups when their overlay unmounts", async () => {
  const lookup = waitingReply()
  const requests: unknown[] = []
  const app = controller(async ({ op, body }) => {
    if (op === "locate") return lookup.promise
    requests.push(body)
    return offline
  })
  const submitted = app.actions.ask({
    target: { kind: "element", element: target() },
    words: "Calmer",
    marks: [],
  })
  app.actions.dispose()
  lookup.resolve(located)
  await submitted
  expect(requests).toEqual([])
  expect(readSessions().pins).toEqual({})
})
