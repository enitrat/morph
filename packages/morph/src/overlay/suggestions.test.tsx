// @vitest-environment happy-dom
import { MotionGlobalConfig } from "motion/react"
import { createElement, useReducer } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { connect, type WireCall } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { initial, reduce } from "./model"
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
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  function Harness() {
    const [state, dispatch] = useReducer(reduce, {
      ...initial,
      open: true,
      composer: {
        target: { kind: "element", element },
        draft: { words: "", marks: [] },
        tool: null,
      },
    })
    return (
      state.composer &&
      createElement(Composer, {
        composer: state.composer,
        area: { left: 0, right: innerWidth },
        dispatch,
      })
    )
  }
  root.render(createElement(Harness))
  const chips = () => [...host.querySelectorAll("[aria-label=Suggestions] button")]
  return { calls, chips, host }
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
  const field = ui.host.querySelector("textarea")
  if (!field) throw new Error("composer field missing")
  await vi.waitFor(() => expect(field.value).toBe("Departure board"))
  const type = (words: string) => {
    // Use the native setter so React observes a browser edit instead of its tracked value setter.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, words)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  }
  type("My own layout")
  await vi.waitFor(() => expect(ui.chips()).toHaveLength(0))
  expect(field.value).toBe("My own layout")
  type("")
  await vi.waitFor(() => expect(ui.chips()).toHaveLength(2))
  expect(field.value).toBe("")
})
