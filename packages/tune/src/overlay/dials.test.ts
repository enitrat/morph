// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DARK, CONFIG } from "../bridge/test-fixtures"
import { themeModelOf, type TokenName } from "../core"
import { questionOf, type Track } from "../dial/rows"
import { connect } from "./bridge"
import { Dial } from "./dials"

const steps = ["var(--neutral-800)", "var(--neutral-700)", "var(--neutral-600)"].map((value) => ({
  value,
  display: { kind: "name" as const, text: value },
  css: null,
}))

const track = (token: TokenName, owner: string | null, impact = 57): Track => ({
  scope: DARK,
  source: { kind: "token", token, impact, owner },
  steps,
  at: 0,
})

let rows = 0
const writes: unknown[] = []
let respond = () => Promise.resolve(Response.json({ changed: true, file: "x.css" }))

/** A dial on a fresh row, so no earlier confirm is remembered for it. */
const dialOf = (owner: string | null, places = 1, reach = `row ${++rows}`, impact = 57) => {
  const shown = track(owner === null ? "--secondary" : "--button-secondary-bg", owner, impact)
  if (shown.source.kind !== "token") throw new Error("a token track")
  const { token } = shown.source
  const { scope } = shown
  return new Dial(
    shown,
    { kind: "token", themes: themeModelOf(CONFIG.tokens.themes), token, scope, within: null },
    questionOf(shown, places),
    reach,
  )
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  writes.length = 0
  respond = () => Promise.resolve(Response.json({ changed: true, file: "x.css" }))
  connect("/__tune")
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (typeof init.body !== "string") throw new Error("expected JSON write")
    writes.push(JSON.parse(init.body))
    return respond()
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("a Fine-tune dial", () => {
  it("writes a token only its own component reads as soon as it is released", async () => {
    const dial = dialOf("Button", 1, undefined, 1)
    dial.step(1)
    dial.release()
    await settled()
    expect(dial.unconfirmed).toBe(false)
    expect(writes).toEqual([
      { kind: "token", token: "--button-secondary-bg", scope: "dark", to: "var(--neutral-700)" },
    ])
  })

  it("keeps the applied value and displays a formatting warning", async () => {
    respond = () =>
      Promise.resolve(Response.json({ changed: true, file: "x.css", warning: "Formatting failed" }))
    const dial = dialOf("Button", 1, undefined, 1)
    const messages: string[] = []
    dial.onNotice((message) => messages.push(message))
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
    expect(writes).toEqual([])
    dial.confirm()
    await settled()
    expect(writes).toEqual([
      { kind: "token", token: "--secondary", scope: "dark", to: "var(--neutral-700)" },
    ])
    expect(dial.unconfirmed).toBe(false)
    dial.step(1)
    dial.release()
    await settled()
    expect(writes).toHaveLength(2)
  })

  it("goes back to the code's step when the designer does not confirm", async () => {
    const dial = dialOf(null)
    dial.step(2)
    expect(dial.revert()).toBe(0)
    expect(dial.unconfirmed).toBe(false)
    dial.release()
    await settled()
    expect(writes).toEqual([])
  })

  it("writes the latest desired step after a pending write succeeds", async () => {
    let finish: (response: Response) => void = () => {
      throw new Error("no pending write")
    }
    respond = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const dial = dialOf("Button", 1, undefined, 1)
    dial.step(1)
    dial.release()
    dial.step(1)
    dial.release()
    expect(writes).toHaveLength(1)
    respond = () => Promise.resolve(Response.json({ changed: true, file: "x.css" }))
    finish(Response.json({ changed: true, file: "x.css" }))
    await settled()
    expect(writes).toEqual([
      { kind: "token", token: "--button-secondary-bg", scope: "dark", to: "var(--neutral-700)" },
      { kind: "token", token: "--button-secondary-bg", scope: "dark", to: "var(--neutral-600)" },
    ])
    expect(dial.revert()).toBe(2)
  })

  it("restores the written step when a write is refused", async () => {
    respond = () =>
      Promise.resolve(
        Response.json({ error: { kind: "invalid", detail: "Cannot write" } }, { status: 400 }),
      )
    const dial = dialOf("Button", 1, undefined, 1)
    const messages: string[] = []
    dial.onNotice((message) => messages.push(message))
    dial.step(1)
    dial.release()
    await settled()
    expect(dial.at).toBe(0)
    expect(messages).toEqual(["Cannot write"])
  })

  it("reports a refused pending write and still writes the newer desired step", async () => {
    let finish: (response: Response) => void = () => {
      throw new Error("no pending write")
    }
    respond = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const dial = dialOf("Button", 1, undefined, 1)
    const messages: string[] = []
    dial.onNotice((message) => messages.push(message))
    dial.step(1)
    dial.release()
    dial.step(1)
    dial.release()
    respond = () => Promise.resolve(Response.json({ changed: true, file: "x.css" }))
    finish(Response.json({ error: { kind: "invalid", detail: "Cannot write" } }, { status: 400 }))
    await settled()
    expect(messages).toEqual(["Cannot write"])
    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ to: "var(--neutral-600)" })
    expect(dial.revert()).toBe(2)
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
    expect(writes).toHaveLength(2)
  })
})
