// @vitest-environment happy-dom
import { MotionGlobalConfig } from "motion/react"
import { afterEach, expect, it, vi } from "vitest"

import { operations } from "../protocol"
import { invalidateCatalog } from "../overlay/catalog"
import { ids, page, pending, ready, session } from "../overlay/session-fixtures"
import { mountMorph, unmountMorph } from "./index"

MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  unmountMorph()
  invalidateCatalog()
  localStorage.clear()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, "fonts")
  Reflect.deleteProperty(document, "elementsFromPoint")
})

it("restores a session, flips ready choices by keyboard, explains unavailable ones, and keeps the selected choice", async () => {
  // happy-dom has no FontFaceSet or hit testing; keep both at the browser boundary.
  Object.defineProperty(document, "fonts", { configurable: true, value: new Set() })
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [] })
  vi.stubGlobal(
    "FontFace",
    class {
      constructor(readonly family: string) {}
      load() {
        return Promise.resolve(this)
      }
    },
  )
  localStorage.setItem(
    "morph:pins",
    JSON.stringify({
      [ids.hero]: { n: 4, name: "Hero", words: "Make it calmer", file: "hero.tsx", at: [] },
    }),
  )
  let view = session(ids.hero, { kind: "shown", variant: "v1", edited: false }, [
    ready("v1"),
    pending("v2", "checks"),
    { ...ready("v3"), state: "failed", reason: "Checks failed.", retryable: true },
  ])
  let kept = false
  const shows: string[] = []
  mountMorph(async ({ op, body }) => {
    if (op === "tokens")
      return {
        status: 200,
        body: {
          files: [],
          components: [],
          plumbing: [],
          themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
        },
      }
    if (op === "suggest") return { status: 200, body: { suggestions: [] } }
    if (op === "show") {
      const request = operations.show.request.parse(body)
      expect(request.id).toBe(ids.hero)
      shows.push(request.variant)
      view = {
        ...view,
        place:
          request.variant === "original"
            ? { kind: "original" }
            : { kind: "shown", variant: request.variant, edited: false },
      }
    } else if (op === "keep") {
      expect(operations.keep.request.parse(body)).toEqual({ id: ids.hero, variant: "v1" })
      kept = true
    } else if (op !== "page") throw new Error(`unexpected ${op}`)
    return { status: 200, body: kept ? page() : page(view) }
  })
  const ui = document.querySelector("morph-root")?.shadowRoot
  if (!ui) throw new Error("widget not mounted")
  const key = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }))
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="toolbar"]')?.textContent).toContain("1 running"),
  )
  key("R", { code: "KeyR", altKey: true, shiftKey: true })
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="toolbar"]')?.textContent).toContain("4HeroA"),
  )
  key("]")
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Pin 4, Hero"),
  )

  key("2")
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="status"]')?.textContent).toContain("still being written"),
  )
  key("3")
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="status"]')?.textContent).toContain("failed"),
  )
  expect(shows).toEqual([])

  key("ArrowRight")
  await vi.waitFor(() =>
    expect(
      [...ui.querySelectorAll('button[aria-pressed="true"]')].some((button) =>
        button.textContent?.includes("Original"),
      ),
    ).toBe(true),
  )
  key("ArrowLeft")
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="toolbar"]')?.textContent).toContain("4HeroA"),
  )
  expect(shows).toEqual(["original", "v1"])

  const input = ui.querySelector('input[aria-label="Refine"]')
  if (!input) throw new Error("refine field missing")
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true, composed: true }))
  expect(shows).toEqual(["original", "v1"])
  const keep = [...ui.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Keep A"),
  )
  if (!keep) throw new Error("keep button missing")
  // happy-dom does not retarget composed clicks to the shadow host as browsers do.
  keep.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="status"]')?.textContent).toContain(
      "Kept A on Hero in hero.tsx",
    ),
  )
  expect(kept).toBe(true)
  await vi.waitFor(() =>
    expect(ui.querySelector('[role="toolbar"]')?.textContent).not.toContain("Hero"),
  )
})
