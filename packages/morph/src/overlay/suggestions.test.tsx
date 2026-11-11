// @vitest-environment happy-dom
import { MotionGlobalConfig } from "motion/react"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { connect, type WireCall } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { type Event } from "./model"
import { page } from "./session-fixtures"
import { invalidateSources } from "./source"
import { Composer } from "./ui/Composer"

MotionGlobalConfig.skipAnimations = true
let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  invalidateCatalog()
  invalidateSources()
  document.body.replaceChildren()
})

const SITE = { path: "app/pricing.tsx", line: 3, col: 5 }

/** A card React rendered from `app/pricing.tsx`, as the overlay finds it. */
function pricingCard(): Element {
  const element = document.createElement("section")
  Object.assign(element, {
    __reactFiber$test: {
      type: "section",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/pricing.js:3:5` },
    },
  })
  document.body.append(element)
  return element
}

function mountComposer(answerSuggest: (call: WireCall) => { status: number; body: unknown }) {
  const calls: WireCall[] = []
  connect(async (call) => {
    calls.push(call)
    if (call.op === "locate") return { status: 200, body: { sources: [SITE] } }
    if (call.op === "plumbing") return { status: 200, body: { plumbing: [] } }
    if (call.op === "suggest") return answerSuggest(call)
    if (call.op === "ask") return { status: 200, body: page() }
    throw new Error(`unexpected ${call.op}`)
  })
  const element = pricingCard()
  const events: Event[] = []
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  root.render(
    createElement(Composer, {
      composer: {
        target: { kind: "element", element },
        draft: { words: "", marks: [] },
        tool: null,
      },
      area: { left: 0, right: innerWidth },
      dispatch: (event: Event) => events.push(event),
    }),
  )
  const chips = () => [...host.querySelectorAll("[aria-label=Suggestions] button")]
  return { calls, events, chips, host }
}

it("offers the bridge's suggestions for the picked site, and a click asks with those words", async () => {
  const ui = mountComposer(() => ({
    status: 200,
    body: {
      suggestions: [
        { words: "Compare three plans", kind: "house" },
        { words: "Make it feel premium", kind: "recent" },
      ],
    },
  }))
  await vi.waitFor(() =>
    expect(ui.chips().map((chip) => chip.textContent)).toEqual([
      "Compare three plans",
      "Make it feel premium",
    ]),
  )
  const asked = ui.calls.find((call) => call.op === "suggest")
  expect(Object.fromEntries(asked?.query ?? [])).toEqual({ path: SITE.path, line: "3", col: "5" })

  ;(ui.chips()[1] as HTMLButtonElement).click()
  await vi.waitFor(() => expect(ui.calls.some((call) => call.op === "ask")).toBe(true))
  const sent = ui.calls.find((call) => call.op === "ask")?.body
  expect(sent).toMatchObject({ words: "Make it feel premium" })
  expect(ui.events[0]).toMatchObject({ kind: "asked", pin: { words: "Make it feel premium" } })
})

it("moves from the empty field into the chips with ↓", async () => {
  const ui = mountComposer(() => ({
    status: 200,
    body: { suggestions: [{ words: "Compare three plans", kind: "house" }] },
  }))
  await vi.waitFor(() => expect(ui.chips()).toHaveLength(1))
  const field = ui.host.querySelector("textarea")
  field?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  expect(ui.host.ownerDocument.activeElement).toBe(ui.chips()[0])
})

it("shows no chips when the bridge does not know the operation", async () => {
  const ui = mountComposer(() => ({ status: 404, body: { error: { kind: "not-found" } } }))
  await vi.waitFor(() => expect(ui.calls.some((call) => call.op === "suggest")).toBe(true))
  await Promise.resolve()
  expect(ui.chips()).toHaveLength(0)
  expect(ui.host.querySelector("textarea")).not.toBeNull()
})

it("starts an empty composer with the bridge's prefill once, and keeps the chips while it is untouched", async () => {
  const ui = mountComposer(() => ({
    status: 200,
    body: {
      suggestions: [
        { words: "Departure board", kind: "house" },
        { words: "Wallet pass", kind: "house" },
      ],
      prefill: "Departure board",
    },
  }))
  await vi.waitFor(() => expect(ui.chips()).toHaveLength(2))
  const typed = ui.events.filter((event) => event.kind === "typed")
  expect(typed).toEqual([{ kind: "typed", words: "Departure board" }])
})

it("leaves the composer empty when the bridge sends no prefill", async () => {
  const ui = mountComposer(() => ({
    status: 200,
    body: { suggestions: [{ words: "Departure board", kind: "house" }] },
  }))
  await vi.waitFor(() => expect(ui.chips()).toHaveLength(1))
  expect(ui.events.some((event) => event.kind === "typed")).toBe(false)
})
