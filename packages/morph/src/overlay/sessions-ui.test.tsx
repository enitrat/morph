// @vitest-environment happy-dom
import { MotionGlobalConfig } from "motion/react"
import { createElement, type Dispatch, useReducer } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { type PageView, type SessionId } from "../variant/model"
import { ask } from "./ask"
import { connect } from "./bridge"
import { useSessions } from "./live"
import { type Event, initial, reduce } from "./model"
import { ids, page, path, ready, session } from "./session-fixtures"
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
})

type Request = { op: string; body: Record<string, unknown> | null }

/** A bridge that answers each operation from a script and records what the overlay asked. */
function fakeBridge(script: (request: Request, now: PageView) => PageView, start: PageView) {
  let now = page()
  later = () => {
    now = start
  }
  const requests: Request[] = []
  connect(async ({ op, body: sent }) => {
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
    const [state, dispatch] = useReducer(reduce, { ...initial, open: true })
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
        picked: [{ element, at: { x: 0, y: 0 } }],
        baseline: null,
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

it("leads the hint for a picked element with A to ask", async () => {
  fakeBridge((_, now) => now, page())
  const ui = await mount({ asks: false })
  ui.send({ kind: "selected", element: ui.elements[0] as Element })
  await vi.waitFor(() => expect(ui.text()).toMatch(/^A Ask.*parent/))
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

it("keeps the shown variant by name, then drops its pin", async () => {
  const bridge = fakeBridge(
    ({ op }) => {
      if (op === "keep") return page(hero({ kind: "original" }))
      throw new Error(`unexpected ${op}`)
    },
    page(hero({ kind: "original" }), button({ kind: "shown", variant: "v2", edited: false })),
  )
  const ui = await mount()
  await vi.waitFor(() => expect(ui.chip("Button")).toContain("B"))
  ui.press("Pin 2, Button, B")
  await vi.waitFor(() => expect(ui.text()).toContain("Keep B"))
  ui.press("Keep B")
  await vi.waitFor(() => expect(ui.text()).toContain("Kept B on Button in button.tsx"))
  expect(bridge.requests).toEqual([{ op: "keep", body: { id: ids.button, variant: "v2" } }])
  expect(ui.chip("Button")).toBeUndefined()
  expect(ui.host.querySelectorAll("button[aria-label^=Pin]")).toHaveLength(1)
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

it("gives sessions a reload left open their pins back from what this browser stored", async () => {
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [ids.button]: { n: 4, name: "Button", words: "Softer", file: "button.tsx", at: [] },
    }),
  )
  fakeBridge(
    (_, now) => now,
    page(hero({ kind: "original" }), button({ kind: "shown", variant: "v3", edited: false })),
  )
  const ui = await mount({ asks: false })
  await vi.waitFor(() => expect(ui.chip("Button")).toContain("C"))
  expect(ui.chip("Session")).toContain("original")
  const numbers = [...ui.host.querySelectorAll("[role=toolbar] button[aria-pressed]")].map(
    (chip) => chip.textContent?.match(/^\d+/)?.[0],
  )
  expect(numbers.filter(Boolean)).toEqual(["4", "5"])
})

it("pins an ask before locating it, so the next pick is not cleared when the first lands", async () => {
  connect(async () => ({ status: 200, body: { sources: [] } }))
  const element = document.createElement("section")
  document.body.append(element)
  const events: Event[] = []
  const sent = ask({ target: { kind: "element", element }, words: "Calmer", marks: [] }, (event) =>
    events.push(event),
  )
  expect(events.map((event) => event.kind)).toEqual(["asked"])
  await sent
})
