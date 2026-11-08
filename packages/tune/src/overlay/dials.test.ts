// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DARK, CONFIG } from "../bridge/test-fixtures"
import { themeModelOf, type TokenName } from "../core"
import { questionOf, type Track } from "../dial/rows"
import { bridge } from "./bridge"
import { Dial } from "./dials"

vi.mock("./bridge", () => ({
  bridge: { dial: vi.fn(async () => ({ ok: true, value: { changed: true, file: "x.css" } })) },
  explain: String,
}))

const steps = ["var(--neutral-800)", "var(--neutral-700)", "var(--neutral-600)"].map((value) => ({
  value,
  display: { kind: "name" as const, text: value },
  css: null,
}))

const track = (token: string, owner: string | null, impact = 57): Track => ({
  source: { kind: "token", token: token as TokenName, scope: DARK, impact, owner },
  steps,
  at: 0,
})

let rows = 0

/** A dial on a fresh row, so no earlier confirm is remembered for it. */
const dialOf = (owner: string | null, places = 1, reach = `row ${++rows}`, impact = 57) => {
  const shown = track(owner === null ? "--secondary" : "--button-secondary-bg", owner, impact)
  if (shown.source.kind !== "token") throw new Error("a token track")
  const { token, scope } = shown.source
  return new Dial(
    shown,
    { kind: "token", themes: themeModelOf(CONFIG.tokens.themes), token, scope, within: null },
    questionOf(shown, places),
    reach,
  )
}

const settled = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

describe("a Fine-tune dial", () => {
  beforeEach(() => {
    vi.mocked(bridge.dial).mockClear()
  })

  it("writes a token only its own component reads as soon as it is released", async () => {
    const dial = dialOf("Button", 1, undefined, 1)
    dial.step(1)
    dial.release()
    await settled()
    expect(dial.unconfirmed).toBe(false)
    expect(bridge.dial).toHaveBeenCalledOnce()
  })

  it("keeps the applied value and displays a formatting warning", async () => {
    vi.mocked(bridge.dial).mockResolvedValueOnce({
      ok: true,
      value: { changed: true, file: "x.css", warning: "Formatting failed" },
    })
    const dial = dialOf("Button", 1, undefined, 1)
    const messages: string[] = []
    dial.onRefused((message) => messages.push(message))
    dial.step(1)
    dial.release()
    await settled()
    expect(dial.revert()).toBe(1)
    expect(messages).toEqual(["Formatting failed"])
  })

  it("asks before a shared role writes, then writes once confirmed", async () => {
    const dial = dialOf(null)
    dial.step(1)
    dial.release()
    await settled()
    expect(dial.unconfirmed).toBe(true)
    expect(bridge.dial).not.toHaveBeenCalled()

    dial.confirm()
    await settled()
    expect(bridge.dial).toHaveBeenCalledWith({
      kind: "token",
      token: "--secondary",
      scope: "dark",
      to: "var(--neutral-700)",
    })
    expect(dial.unconfirmed).toBe(false)

    dial.step(1)
    dial.release()
    await settled()
    expect(bridge.dial).toHaveBeenCalledTimes(2)
  })

  it("goes back to the code's step when the designer does not confirm", async () => {
    const dial = dialOf(null)
    dial.step(2)
    expect(dial.revert()).toBe(0)
    expect(dial.unconfirmed).toBe(false)
    dial.release()
    await settled()
    expect(bridge.dial).not.toHaveBeenCalled()
  })
})

describe("what a Fine-tune write asks first", () => {
  it("names a ds component token's product-wide reach before what this page shows", () => {
    expect(questionOf(track("--button-radius", "Button", 37), 2)).toBe(
      "This changes every Button in the product (37 components, 2 on this page). Write it?",
    )
    expect(questionOf(track("--button-secondary-bg", "Button", 37), 1)).toBe(
      "This changes every Button in the product (37 components, 1 on this page). Write it?",
    )
    expect(questionOf(track("--secondary", null), 1)).toBe("This changes 57 components. Write it?")
  })

  it("asks nothing when the write restyles only the picked element", () => {
    expect(questionOf(track("--button-secondary-bg", "Button", 1), 1)).toBeNull()
  })

  it("asks once per row: a confirmed row writes at once when picked again", async () => {
    vi.mocked(bridge.dial).mockClear()
    const first = dialOf("HeroFigure", 6, "gap row")
    first.step(1)
    first.release()
    expect(first.unconfirmed).toBe(true)
    first.confirm()
    await settled()

    const again = dialOf("HeroFigure", 6, "gap row")
    again.step(1)
    again.release()
    await settled()
    expect(again.unconfirmed).toBe(false)
    expect(bridge.dial).toHaveBeenCalledTimes(2)
  })
})
