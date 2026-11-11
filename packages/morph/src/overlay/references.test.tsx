// @vitest-environment happy-dom
import { MotionGlobalConfig } from "motion/react"
import { createElement, type Dispatch, useReducer } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { type ActiveSessionView } from "../variant/model"
import { actionsOf, type SessionActions } from "./ask"
import { connect } from "./bridge"
import { useSessions } from "./live"
import { type Event, initial, reduce, type State } from "./model"
import { captureReference, captureTarget } from "./pinned-targets"
import { NO_SCALES } from "./scale"
import { ids, page, session, threads } from "./session-fixtures"
import { readSessions, writePins } from "./session-store"
import { Inspector } from "./ui/Inspector"

MotionGlobalConfig.skipAnimations = true
let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  vi.restoreAllMocks()
  document.body.replaceChildren()
  localStorage.clear()
  sessionStorage.clear()
})

function element(padding: number) {
  const target = document.createElement("section")
  target.style.padding = `${padding}px`
  target.textContent = `Padding ${padding}`
  document.body.append(target)
  return target
}

async function mount(elements: HTMLElement[]) {
  const [first] = elements
  if (first === undefined) throw new Error("No targets")
  const selection: State["selection"] = { kind: "element", element: first }
  let view = session(ids.hero, { kind: "original" })
  connect(async ({ op }) =>
    op === "page" ? { status: 200, body: page(view) } : { status: 503, body: null },
  )
  const seed = reduce(
    { ...initial, open: true },
    {
      kind: "asked",
      pin: {
        id: ids.hero,
        n: null,
        name: "Frame",
        words: "Calmer",
        file: "hero.tsx",
        targets: elements.map(captureTarget),
      },
    },
  )
  let latest: State = seed
  let send: Dispatch<Event> = () => {
    throw new Error("Not mounted")
  }
  let actions: SessionActions | null = null
  function Harness() {
    const [state, dispatch] = useReducer(reduce, {
      ...seed,
      selection,
      sidebar: { kind: "open", tab: "specs", side: "right", width: 340, auto: false },
    })
    latest = state
    send = dispatch
    actions = useSessions(state, dispatch)
    return createElement(Inspector, {
      state,
      preview: null,
      scales: NO_SCALES,
      theme: null,
      dispatch,
    })
  }
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  root.render(createElement(Harness))
  const comparison = () => host.querySelector('[aria-label^="Reference comparison"]')
  await vi.waitFor(() => expect(comparison()).not.toBeNull())
  const poll = async (next: ActiveSessionView = view) => {
    view = next
    const before = latest.sessions.page.observation
    if (actions === null) throw new Error("Not mounted")
    actions.poll()
    await vi.waitFor(() => expect(latest.sessions.page.observation).toBeGreaterThan(before))
  }
  return { host, comparison, poll, dispatch: (event: Event) => send(event), state: () => latest }
}

it("keeps the visible reference when source placement says original before the DOM updates", async () => {
  const target = element(16)
  const ui = await mount([target])
  target.style.padding = "40px"
  await ui.poll(session(ids.hero, { kind: "shown", variant: "v1", edited: false }))
  for (let count = 0; count < 3; count++) await ui.poll(session(ids.hero, { kind: "original" }))
  expect(ui.comparison()?.querySelector("s")?.textContent).toBe("16")
  expect(ui.comparison()?.textContent).toContain("40")
  expect(ui.comparison()?.textContent).toContain("Before first ask")
  expect(ui.comparison()?.textContent).not.toContain("Variant A")
  expect(ui.comparison()?.textContent).not.toContain("vs original")
  expect(ui.state().sessions.pins[threads.hero]?.targets[0]?.reference?.spec.padding).toEqual([
    16, 16, 16, 16,
  ])
})

it("compares each target with its own reference and captures only the chosen one", async () => {
  const first = element(16)
  const second = element(8)
  const ui = await mount([first, second])
  second.style.padding = "24px"
  ui.dispatch({ kind: "selected", element: second })
  await vi.waitFor(() => expect(ui.comparison()?.querySelector("s")?.textContent).toBe("8"))
  expect(ui.comparison()?.getAttribute("aria-label")).toContain("target 2")
  ui.comparison()?.querySelector("button")?.click()
  await vi.waitFor(() => expect(ui.comparison()?.textContent).toContain("Saved by you"))
  expect(ui.comparison()?.textContent).toContain("No measured differences")
  const targets = ui.state().sessions.pins[threads.hero]?.targets
  expect(targets?.[0]?.reference?.spec.padding).toEqual([16, 16, 16, 16])
  expect(targets?.[1]?.reference?.spec.padding).toEqual([24, 24, 24, 24])
  await ui.poll({ ...session(ids.button, { kind: "original" }), thread: threads.hero })
  expect(ui.state().sessions.pins[threads.hero]?.targets).toEqual(targets)
})

it("keeps saved references through reload and identifies position recovery explicitly", async () => {
  const target = element(16)
  const ui = await mount([target])
  writePins(ui.state().sessions.pins)
  const restored = readSessions()
  expect(restored.pins[threads.hero]?.targets[0]?.reference?.spec.padding).toEqual([16, 16, 16, 16])
  expect(restored.pins[threads.hero]?.targets[0]?.match).toEqual({ kind: "missing" })
  target.remove()
  const replacement = element(40)
  document.elementsFromPoint = () => [replacement]
  await ui.poll()
  ui.dispatch({ kind: "selected", element: replacement })
  await vi.waitFor(() => expect(ui.comparison()?.textContent).toContain("saved target position"))
  expect(ui.comparison()?.querySelector("s")?.textContent).toBe("16")
  expect(ui.comparison()?.textContent).toContain("40")
})

it("does not let a stale capture or target match overwrite another target's reference", async () => {
  const target = element(16)
  const ui = await mount([target])
  const replacement = element(24)
  ui.dispatch({
    kind: "retargeted",
    id: threads.hero,
    matches: [{ kind: "position", element: replacement }],
  })
  ui.dispatch({
    kind: "reference-saved",
    thread: threads.hero,
    slot: 0,
    element: target,
    reference: captureReference(target),
  })
  await ui.poll()
  expect(ui.state().sessions.pins[threads.hero]?.targets[0]?.reference?.capture).toBe(
    "before-first-ask",
  )
  ui.dispatch({
    kind: "reference-saved",
    thread: threads.hero,
    slot: 0,
    element: replacement,
    reference: captureReference(replacement),
  })
  ui.dispatch({
    kind: "retargeted",
    id: threads.hero,
    matches: [{ kind: "position", element: replacement }],
  })
  await ui.poll()
  expect(ui.state().sessions.pins[threads.hero]?.targets[0]?.reference?.spec.padding).toEqual([
    24, 24, 24, 24,
  ])
})

it("captures every frame subject before asynchronous source lookup", async () => {
  const first = element(16)
  const second = element(8)
  let state = { ...initial, open: true }
  connect(async () => ({ status: 503, body: null }))
  const actions = actionsOf((event) => {
    state = reduce(state, event)
  })
  const sent = actions.ask({
    target: {
      kind: "frame",
      frame: {
        rect: { left: 0, top: 0, width: 200, height: 100 },
        items: [first, second],
        narrow: null,
      },
    },
    words: "Calmer",
    marks: [],
  })
  const targets = Object.values(state.sessions.pins)[0]?.targets
  first.style.padding = "40px"
  second.style.padding = "48px"
  expect(targets?.map((target) => target.reference?.spec.padding[0])).toEqual([16, 8])
  await sent
})

it("imports location-only metadata without inventing a measurement and isolates corrupt references", () => {
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [threads.hero]: { n: 1, name: "Hero", words: "Calmer", file: null, at: [{ x: 1, y: 2 }] },
    }),
  )
  expect(readSessions().pins[threads.hero]?.targets).toEqual([
    { at: { x: 1, y: 2 }, reference: null, match: { kind: "missing" } },
  ])
  const first = captureTarget(element(16))
  const second = captureTarget(element(8))
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [threads.hero]: {
        n: 1,
        name: "Hero",
        words: "Calmer",
        file: null,
        targets: [
          { at: first.at, reference: { bad: true } },
          { at: second.at, reference: second.reference },
        ],
      },
    }),
  )
  const restored = readSessions().pins[threads.hero]?.targets
  expect(restored?.[0]?.reference).toBeNull()
  expect(restored?.[1]?.reference).toEqual(second.reference)
})

it("retains other threads when one stored locator is corrupt", () => {
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [threads.hero]: {
        n: 1,
        name: "Hero",
        words: "Calmer",
        file: null,
        targets: [{ at: { x: "invalid", y: 2 }, reference: null }],
      },
      [threads.button]: {
        n: 2,
        name: "Button",
        words: "Calmer",
        file: null,
        targets: [{ at: { x: 20, y: 30 }, reference: null }],
      },
    }),
  )
  const restored = readSessions()
  expect(restored.pins[threads.hero]).toBeUndefined()
  expect(restored.pins[threads.button]?.targets[0]?.at).toEqual({ x: 20, y: 30 })
})
