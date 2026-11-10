import { describe, expect, it } from "vitest"

import { manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage } from "./stage"
import { type Operation, operations, type PageView, SessionId } from "./wire"

const TOTAL = "site/scenes/receipt/ReceiptTotal.tsx"
const RECEIPT = "site/scenes/receipt/Receipt.tsx"
const TABLE = "site/scenes/table/Table.tsx"
const THEME = "site/scenes/table/theme.css"

function setup() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown, query = new URLSearchParams()) =>
    transport({ op, query, body })
  const page = async () => operations.page.response.parse((await call("page")).body)
  const ask = (words: string, path = TOTAL, id = SessionId.parse(crypto.randomUUID())) =>
    call("ask", {
      id,
      words,
      targets: [{ source: { path, line: 7, col: 5 }, owner: ["Receipt"], text: "Total" }],
    })
  /** Asks, then lets every variant land and the first one show. */
  const landed = async (words: string, path = TOTAL) => {
    const id = SessionId.parse(crypto.randomUUID())
    const reply = await ask(words, path, id)
    if (reply.status !== 200) throw new Error(JSON.stringify(reply.body))
    now += 10_000
    await page()
    await page()
    return id
  }
  const kept = (path: string) => stage.snapshot().kept.get(path as never)?.key
  const shown = (path: string) => stage.snapshot().shown.get(path as never)?.key
  return { stage, call, page, ask, landed, kept, shown, at: (ms: number) => (now = ms) }
}

const only = (view: PageView) => {
  const [session] = view.sessions
  if (session === undefined) throw new Error("no session")
  return session
}

describe("replay transport", () => {
  it("shows the first ready variant on a page poll, after one poll on the original", async () => {
    const { page, ask, at, shown } = setup()
    const asked = await ask("Make the total the hero")
    expect(asked.status).toBe(200)
    expect(only(operations.ask.response.parse(asked.body)).place).toEqual({ kind: "original" })

    at(10_000)
    const first = only(await page())
    expect(first.place).toEqual({ kind: "original" })
    expect(first.variants.map((variant) => variant.state)).toEqual(["ready", "ready", "ready"])
    expect(shown(TOTAL)).toBe("receipt/ReceiptTotal.tsx")

    expect(only(await page()).place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(shown(TOTAL)).toBe("receipt/ReceiptTotal.tsx/total-hero:v1")
  })

  it("moves through the job phases before the first variant lands in 3 to 5 s", async () => {
    const { page, ask, at } = setup()
    await ask("Make the total the hero")
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

  it("flips, then keeps, a variant as its file's new revision and a new version", async () => {
    const { stage, call, landed, kept, shown } = setup()
    const id = await landed("Make the total the hero")
    const flipped = await call("show", { id, variant: "v2" })
    expect(only(operations.show.response.parse(flipped.body)).place).toMatchObject({
      variant: "v2",
    })
    expect(shown(TOTAL)).toBe("receipt/ReceiptTotal.tsx/total-hero:v2")
    expect(kept(TOTAL)).toBe("receipt/ReceiptTotal.tsx")

    const reply = await call("keep", { id, variant: "v2" })
    expect(operations.keep.response.parse(reply.body).sessions).toEqual([])
    expect(kept(TOTAL)).toBe("receipt/ReceiptTotal.tsx/total-hero:v2")
    const { versions, at } = stage.snapshot()
    expect(versions.map((version) => version.parent)).toEqual([null, 0])
    expect(at).toBe(1)
  })

  it("reports the file a variant rewrites and its stat against the revision it starts from", async () => {
    const { page, ask, at } = setup()
    await ask("Make the total the hero")
    at(10_000)
    const [a] = only(await page()).variants
    expect(a).toMatchObject({ state: "ready", files: [TOTAL] })
    expect(a?.state === "ready" && a.stat.add + a.stat.del).toBeGreaterThan(0)
  })

  it("refuses a keep of a variant the page does not show", async () => {
    const { call, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Make the total the hero", TOTAL, id)
    const reply = await call("keep", { id, variant: "v3" })
    expect(reply).toEqual({ status: 409, body: { error: { kind: "not-shown", variant: "v3" } } })
  })

  it("snaps free text to the closest recorded ask, and says so on each variant", async () => {
    const { page, ask, at } = setup()
    expect((await ask("a bigger total, please")).status).toBe(200)
    at(10_000)
    const [a] = only(await page()).variants
    expect(a?.state === "ready" && a.summary).toMatch(
      /^Closest recorded ask: “Make the total the hero”\./,
    )
  })

  it("refuses words no recorded ask is close to, naming the asks it has", async () => {
    const { ask } = setup()
    const reply = await ask("make the button blue")
    expect(reply.status).toBe(409)
    expect(reply.body).toMatchObject({ error: { kind: "planner-failed" } })
    expect(JSON.stringify(reply.body)).toContain("Make the total the hero")
  })

  it("suggests the asks of the picked file, and the table's at the board", async () => {
    const { call } = setup()
    const at = async (path: string) =>
      (await call("suggest", undefined, new URLSearchParams({ path }))).body
    expect(await at(TOTAL)).toMatchObject({
      suggestions: expect.arrayContaining([{ words: "Make the total the hero", kind: "house" }]),
    })
    const board = await at(TABLE)
    const styles = manifest.files.get(THEME as never)?.original.asks ?? []
    expect(board).toEqual({
      suggestions: styles.map((node) => ({ words: node.words, kind: "house" })),
    })
  })

  it("answers an ask re-posted with the same id with the session it started", async () => {
    const { page, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Make the total the hero", TOTAL, id)
    await ask("Make the total the hero", TOTAL, id)
    expect((await page()).sessions).toHaveLength(1)
  })

  it("holds a second ask on a shown file: it waits on the first, which a keep leaves stale", async () => {
    const { call, page, landed, kept } = setup()
    const first = await landed("Make the total the hero")
    const second = await landed("Make the total the hero")
    const [older, newer] = (await page()).sessions
    // The newer ask's first variant takes the file, as the bridge ranks it; the older one waits.
    expect(newer?.place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(older?.place).toEqual({
      kind: "waiting",
      variant: "v1",
      on: [{ session: second, variant: "v1", files: [TOTAL] }],
    })
    // Flipping the older one takes the file back.
    await call("show", { id: first, variant: "v3" })
    const [back, held] = (await page()).sessions
    expect(back?.place).toMatchObject({ kind: "shown", variant: "v3" })
    expect(held?.place).toMatchObject({ kind: "waiting", on: [{ session: first, files: [TOTAL] }] })
    // Keeping it rewrites the file under the other, which can no longer move it.
    await call("keep", { id: first, variant: "v3" })
    expect(kept(TOTAL)).toBe("receipt/ReceiptTotal.tsx/total-hero:v3")
    expect(only(await page()).place).toEqual({
      kind: "conflict",
      want: "v1",
      files: [TOTAL],
      showing: null,
    })
    const refused = await call("keep", { id: second, variant: "v1" })
    expect(refused).toEqual({ status: 409, body: { error: { kind: "conflict", files: [TOTAL] } } })
  })

  it("goes back to a kept version, and resets to the original", async () => {
    const { stage, call, landed, kept } = setup()
    const id = await landed("Make the total the hero")
    await call("keep", { id, variant: "v1" })
    stage.jump(0)
    expect(kept(TOTAL)).toBe("receipt/ReceiptTotal.tsx")
    await landed("Make the total the hero")
    stage.jump(1)
    expect(kept(TOTAL)).toBe("receipt/ReceiptTotal.tsx/total-hero:v1")
    expect(stage.snapshot().sessions).toEqual([])
    stage.reset()
    expect(stage.snapshot().versions).toHaveLength(1)
    expect(kept(RECEIPT)).toBe("receipt/Receipt.tsx")
  })
})
