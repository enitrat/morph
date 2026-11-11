// @vitest-environment happy-dom
import { captureTarget } from "./pinned-targets"
import { MotionGlobalConfig } from "motion/react"
import { createElement, type Dispatch, useReducer } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { operations } from "../protocol"
import { type PageView, type SessionId } from "../variant/model"
import { actionsOf } from "./ask"
import { connect } from "./bridge"
import { readSessions } from "./session-store"
import { useSessions } from "./live"
import { type Event, initial, reduce, type State } from "./model"
import { ids, threads, info, page, path, ready, session } from "./session-fixtures"
import { Dock, Notice } from "./ui/Dock"
import { Pins } from "./ui/Pins"

MotionGlobalConfig.skipAnimations = true
let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  localStorage.clear()
  sessionStorage.clear()
})

type Request = { op: string; body: Record<string, unknown> | null }

/**
 * A bridge that answers each operation from a script and records what the overlay asked. Like a
 * bridge older than `suggest`, it knows no such operation.
 */
function fakeBridge(script: (request: Request, now: PageView) => PageView, start: PageView) {
  let now = page()
  later = () => {
    now = page(...start.sessions)
  }
  const requests: Request[] = []
  connect(async ({ op, body: sent }) => {
    if (op === "suggest") return { status: 404, body: { error: { kind: "not-found" } } }
    const body = (sent ?? null) as Record<string, unknown> | null
    if (op !== "page") requests.push({ op, body })
    now = op === "page" ? now : script({ op, body }, now)
    return { status: 200, body: now }
  })
  return { requests }
}

/** Puts the scripted page in place once the test's asks are pinned, as a real ask would. */
let later = () => {}

const heroFile = ["app/hero.tsx"]
const buttonFile = ["ui/button.tsx"]
const heroVariants = [ready("v1", heroFile), ready("v2", heroFile), ready("v3", heroFile)]
const buttonVariants = [ready("v1", buttonFile), ready("v2", buttonFile), ready("v3", buttonFile)]
const hero = (place: Parameters<typeof session>[1]) => session(ids.hero, place, heroVariants)
const button = (place: Parameters<typeof session>[1]) => session(ids.button, place, buttonVariants)

async function mount({ asks = true } = {}) {
  let send: Dispatch<Event> = () => {}
  let poll = () => {}
  const elements = [document.createElement("section"), document.createElement("button")]
  document.body.append(...elements)
  function Harness() {
    const [state, dispatch] = useReducer(reduce, { ...initial, open: true }, (state) => ({
      ...state,
      sessions: readSessions(),
    }))
    send = dispatch
    const actions = useSessions(state, dispatch)
    poll = actions.poll
    return createElement(
      "div",
      null,
      createElement(Pins, { state, area: { left: 0, right: innerWidth }, actions, dispatch }),
      createElement(Notice, { state, center: 500 }),
      createElement(Dock, { state, center: 500, dispatch }),
    )
  }
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  root.render(createElement(Harness))
  await vi.waitFor(() => expect(host.querySelector("[role=toolbar]")).not.toBeNull())
  const pinFor = (id: SessionId, name: string, element: Element) =>
    send({
      kind: "asked",
      pin: {
        id,
        n: null,
        name,
        words: `Make ${name} calmer`,
        file: `${name.toLowerCase()}.tsx`,
        targets: [captureTarget(element)],
      },
    })
  if (asks) {
    pinFor(ids.hero, "Hero", elements[0] as Element)
    pinFor(ids.button, "Button", elements[1] as Element)
  }
  later()
  poll()
  const text = () => host.textContent ?? ""
  const press = (label: string) => {
    const found = [...host.querySelectorAll("button")].find(
      (entry) =>
        entry.getAttribute("aria-label") === label ||
        entry.textContent?.replace(/\s+/g, " ").trim().startsWith(label),
    )
    if (!found) throw new Error(`no button "${label}" in: ${text()}`)
    found.click()
  }
  const chip = (name: string) =>
    [...host.querySelectorAll("[role=toolbar] button")]
      .find((entry) => entry.textContent?.includes(name))
      ?.textContent?.replace(name, " ")
  return { host, text, press, chip, send: (event: Event) => send(event), elements }
}

it("shows two sessions on the page at once, each pin and chip with its letter", async () => {
  fakeBridge(
    (_, now) => now,
    page(
      hero({ kind: "shown", variant: "v1", edited: false }),
      button({ kind: "shown", variant: "v2", edited: false }),
    ),
  )
  const ui = await mount()
  await vi.waitFor(() => {
    expect(ui.chip("Hero")).toContain("A")
    expect(ui.chip("Button")).toContain("B")
  })
  const pins = [...ui.host.querySelectorAll("button[aria-label^=Pin]")].map((pin) =>
    pin.getAttribute("aria-label"),
  )
  expect(pins).toEqual(["Pin 1, Hero, A", "Pin 2, Button, B"])
})

it("opens the first ask's card, so the flip keys are in view when its variants land", async () => {
  fakeBridge((_, now) => now, page(hero({ kind: "original" }), button({ kind: "original" })))
  const ui = await mount()
  await vi.waitFor(() => expect(ui.chip("Hero")).toBeDefined())
  expect(ui.host.querySelector("[role=dialog]")?.getAttribute("aria-label")).toBe("Pin 1, Hero")
  expect(ui.text()).toContain("0–3 flip")
})

it("takes the files over, names the holder while waiting, and returns when flipped back", async () => {
  const hold = (session: SessionId, variant: "v1" | "v2", files: string[]) => ({
    session,
    variant,
    files: files.map(path),
  })
  const shared = ["app/page.tsx"]
  const bridge = fakeBridge(
    ({ op, body }) => {
      if (op === "show" && body?.id === ids.button)
        return page(
          hero({ kind: "waiting", variant: "v1", on: [hold(ids.button, "v2", shared)] }),
          button({ kind: "shown", variant: "v2", edited: false }),
        )
      if (op === "show" && body?.id === ids.hero)
        return page(
          hero({ kind: "shown", variant: "v1", edited: false }),
          button({ kind: "waiting", variant: "v2", on: [hold(ids.hero, "v1", shared)] }),
        )
      throw new Error(`unexpected ${op}`)
    },
    page(hero({ kind: "shown", variant: "v1", edited: false }), button({ kind: "original" })),
  )
  const ui = await mount()
  await vi.waitFor(() => expect(ui.chip("Hero")).toContain("A"))

  ui.press("Pin 2, Button, original")
  await vi.waitFor(() => expect(ui.text()).toContain("“Make Button calmer”"))
  ui.press("BTitle v2")
  await vi.waitFor(() => expect(ui.chip("Hero")).toContain("waits A"))
  expect(bridge.requests).toEqual([{ op: "show", body: { id: ids.button, variant: "v2" } }])

  ui.press("Pin 1, Hero, waits A")
  await vi.waitFor(() => expect(ui.text()).toContain("Waiting for #2 Button · page.tsx."))
  ui.press("ATitle v1")
  await vi.waitFor(() => {
    expect(ui.chip("Hero")).toContain("A")
    expect(ui.chip("Button")).toContain("waits B")
  })
})

it("shows a conflict's files and offers to keep what is on the page", async () => {
  const bridge = fakeBridge(
    ({ op }) => {
      if (op === "keep") return page(button({ kind: "original" }))
      throw new Error(`unexpected ${op}`)
    },
    page(
      hero({ kind: "conflict", want: "original", files: [path("app/hero.tsx")], showing: "v3" }),
      button({ kind: "original" }),
    ),
  )
  const ui = await mount()
  await vi.waitFor(() => expect(ui.chip("Hero")).toContain("conflict"))
  ui.press("Pin 1, Hero, conflict")
  await vi.waitFor(() => expect(ui.text()).toContain("Can't move hero.tsx."))
  expect(ui.text()).toContain("Keep C with your edits")
  ui.press("Keep C")
  await vi.waitFor(() =>
    expect(bridge.requests).toEqual([{ op: "keep", body: { id: ids.hero, variant: "v3" } }]),
  )
})

it("offers the bridge's refine suggestions under an empty refine field, and refines with one", async () => {
  const refined: unknown[] = []
  const suggested: string[] = []
  let current = page(hero({ kind: "shown", variant: "v1", edited: false }))
  connect(async ({ op, query, body }) => {
    if (op === "suggest") {
      suggested.push(query.toString())
      return {
        status: 200,
        body: { suggestions: [{ words: "Highlight the annual savings", kind: "refine" }] },
      }
    }
    if (op === "locate")
      return { status: 200, body: { sources: [{ path: "app/hero.tsx", line: 1, col: 1 }] } }
    if (op === "plumbing") return { status: 200, body: { plumbing: [] } }
    if (op === "refine") {
      refined.push(body)
      const request = operations.refine.request.parse(body)
      current = page({
        ...info(request.ask.id, threads.hero),
        words: request.ask.words,
        kind: "plan-failed",
        reason: "Planner unavailable",
        trail: [{ variant: "v1", title: "Title v1", feedback: request.ask.words }],
      })
    }
    return { status: 200, body: current }
  })
  const ui = await mount({ asks: false })
  const card = ui.elements[0] as Element
  Object.assign(card, {
    __reactFiber$test: {
      type: "section",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/hero.js:1:1` },
    },
  })
  ui.send({
    kind: "asked",
    pin: {
      id: ids.hero,
      n: null,
      name: "Hero",
      words: "Make Hero calmer",
      file: "hero.tsx",
      targets: [captureTarget(card)],
    },
  })
  ui.send({ kind: "page", page: page(hero({ kind: "shown", variant: "v1", edited: false })) })
  await vi.waitFor(() => expect(ui.text()).toContain("Highlight the annual savings"))
  expect(suggested).toEqual([`session=${ids.hero}`])
  ui.press("Highlight the annual savings")
  await vi.waitFor(() =>
    expect(refined).toEqual([
      expect.objectContaining({
        from: ids.hero,
        variant: "v1",
        ask: expect.objectContaining({ words: "Highlight the annual savings" }),
      }),
    ]),
  )
  await vi.waitFor(() => expect(ui.text()).toContain("Planner unavailable"))
  expect(ui.text()).toContain("R2")
  expect(ui.text()).toContain("Built on A")
  expect(ui.text()).toContain("Retry planning")
})

it("restores planning after reload, shows its failure, and offers explicit retry and discard", async () => {
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [ids.hero]: { n: 1, name: "Hero", words: "Calmer", file: "hero.tsx", at: [] },
    }),
  )
  const planning = { ...info(ids.hero), kind: "planning" as const }
  const bridge = fakeBridge(({ op }) => {
    if (op === "retryPlan") return page(planning)
    if (op === "discard") return page()
    throw new Error(`Unexpected ${op}`)
  }, page(planning))
  const ui = await mount({ asks: false })
  await vi.waitFor(() => expect(ui.chip("Hero")).toContain("planning"))
  ui.host.querySelector<HTMLButtonElement>('button[title="Hero · planning  [ ]"]')?.click()
  await vi.waitFor(() => expect(ui.text()).toContain("Planning directions…"))
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="Refine"]')?.disabled).toBe(true)
  expect(
    [...ui.host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Keep")
      ?.disabled,
  ).toBe(true)
  expect(ui.text()).not.toContain("Original")
  ui.send({
    kind: "page",
    page: page({ ...info(ids.hero), kind: "plan-failed", reason: "Planner unavailable" }),
  })
  await vi.waitFor(() => expect(ui.text()).toContain("Planner unavailable"))
  ui.press("Retry planning")
  await vi.waitFor(() => expect(ui.text()).toContain("Planning directions…"))
  ui.press("Discard")
  await vi.waitFor(() => expect(ui.chip("Hero")).toBeUndefined())
  expect(bridge.requests.map(({ op }) => op)).toEqual(["retryPlan", "discard"])
})

it("keeps a newer selection when an earlier ask finishes locating", async () => {
  const first = document.createElement("section")
  const second = document.createElement("button")
  document.body.append(first, second)
  Object.assign(first, {
    __reactFiber$test: {
      type: "section",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/hero.js:1:1` },
    },
  })
  let finish: (reply: { status: number; body: unknown }) => void = () => {
    throw new Error("locate was not requested")
  }
  connect(async ({ op, body }) => {
    if (op === "locate")
      return new Promise((resolve) => {
        finish = resolve
      })
    if (op === "plumbing") return { status: 200, body: { plumbing: [] } }
    if (op === "ask") {
      const request = operations.ask.request.parse(body)
      return { status: 200, body: page(session(request.id, { kind: "original" })) }
    }
    throw new Error(`unexpected ${op}`)
  })
  let state: State = { ...initial, open: true }
  const dispatch = (event: Event) => {
    state = reduce(state, event)
  }
  dispatch({ kind: "selected", element: first })
  dispatch({ kind: "typed", words: "Calmer" })
  const sent = actionsOf(dispatch).ask({
    target: { kind: "element", element: first },
    words: "Calmer",
    marks: [],
  })
  expect(state.composer).toBeNull()
  dispatch({ kind: "selected", element: second })
  finish({ status: 200, body: { sources: [{ path: "app/hero.tsx", line: 1, col: 1 }] } })
  await sent
  expect(state.composer?.target).toEqual({ kind: "element", element: second })
  expect(state.sessions.page.sessions).toHaveLength(1)
})
