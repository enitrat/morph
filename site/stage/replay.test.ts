import { describe, expect, it } from "vitest"

import { manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage } from "./stage"
import { type Operation, operations, type PageView, SessionId } from "./wire"

const CARD = "site/scenes/pricing/PricingCard.tsx"

function setup() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown, query = new URLSearchParams()) =>
    transport({ op, query, body })
  const page = async () => {
    const reply = await call("page")
    return operations.page.response.parse(reply.body)
  }
  const ask = (words: string, id = SessionId.parse(crypto.randomUUID())) =>
    call("ask", {
      id,
      words,
      targets: [{ source: { path: CARD, line: 26, col: 5 }, owner: ["PricingCard"], text: "Pro" }],
    })
  return { stage, call, page, ask, at: (ms: number) => (now = ms) }
}

const only = (view: PageView) => {
  const [session] = view.sessions
  if (session === undefined) throw new Error("no session")
  return session
}

describe("replay transport", () => {
  it("shows the first ready variant on a page poll, after one poll on the original", async () => {
    const { stage, page, ask, at } = setup()
    const asked = await ask("Compare three plans")
    expect(asked.status).toBe(200)
    expect(only(operations.ask.response.parse(asked.body)).place).toEqual({ kind: "original" })

    at(10_000)
    const first = only(await page())
    expect(first.place).toEqual({ kind: "original" })
    expect(first.variants.map((variant) => variant.state)).toEqual(["ready", "ready", "ready"])
    expect(stage.shown("pricing").key).toBe("pricing")

    expect(only(await page()).place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(stage.shown("pricing").key).toBe("pricing/compare-three-plans:v1")
  })

  it("moves through the job phases before the first variant lands in 3 to 5 s", async () => {
    const { page, ask, at } = setup()
    await ask("Compare three plans")
    const phases: string[] = []
    let landed = 0
    for (let ms = 0; ms <= 6000 && landed === 0; ms += 50) {
      at(ms)
      const view = only(await page())
      const [v1] = view.variants
      if (v1?.state === "pending") phases.push(v1.phase)
      if (view.place.kind === "shown") landed = ms
    }
    expect([...new Set(phases)]).toEqual(["queued", "slot", "agent", "checks", "capture"])
    expect(landed).toBeGreaterThanOrEqual(3000)
    expect(landed).toBeLessThanOrEqual(5000)
  })

  it("flips, then keeps, a variant as the scene's new revision", async () => {
    const { stage, call, page, ask, at } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Compare three plans", id)
    at(10_000)
    await page()
    await page()
    const shown = await call("show", { id, variant: "v2" })
    expect(only(operations.show.response.parse(shown.body)).place).toMatchObject({ variant: "v2" })
    expect(stage.shown("pricing").key).toBe("pricing/compare-three-plans:v2")

    const kept = await call("keep", { id, variant: "v2" })
    expect(operations.keep.response.parse(kept.body).sessions).toEqual([])
    expect(stage.shown("pricing").key).toBe("pricing/compare-three-plans:v2")
  })

  it("reports a new file a variant adds", async () => {
    const { page, ask, at } = setup()
    await ask("Compare three plans")
    at(10_000)
    const [, table] = only(await page()).variants
    expect(table).toMatchObject({
      state: "ready",
      files: ["site/scenes/pricing/PricingCard.tsx", "site/scenes/pricing/PlanTable.tsx"],
    })
  })

  it("refuses a keep of a variant the page does not show", async () => {
    const { call, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Compare three plans", id)
    const reply = await call("keep", { id, variant: "v3" })
    expect(reply).toEqual({ status: 409, body: { error: { kind: "not-shown", variant: "v3" } } })
  })

  it("snaps free text to the closest recorded ask", async () => {
    const { ask } = setup()
    expect((await ask("show the pricing tiers")).status).toBe(200)
  })

  it("refuses words no recorded ask is close to, naming the asks it has", async () => {
    const { ask } = setup()
    const reply = await ask("make the button blue")
    expect(reply.status).toBe(409)
    expect(reply.body).toMatchObject({ error: { kind: "planner-failed" } })
    expect(JSON.stringify(reply.body)).toContain("Compare three plans")
  })

  it("suggests the current revision's asks for a site", async () => {
    const { call } = setup()
    const reply = await call("suggest", undefined, new URLSearchParams({ path: CARD }))
    expect(reply.body).toEqual({ suggestions: [{ words: "Compare three plans", kind: "house" }] })
  })

  it("answers an ask re-posted with the same id with the session it started", async () => {
    const { page, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Compare three plans", id)
    await ask("Compare three plans", id)
    expect((await page()).sessions).toHaveLength(1)
  })
})
