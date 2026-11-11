import { describe, expect, it } from "vitest"

import { manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage } from "./stage"
import { type Operation, operations, type PageView, SessionId } from "./wire"

const ROUTE = "site/scenes/pass/PassRoute.tsx"
const PASS = "site/scenes/pass/Pass.tsx"
const TABLE = "site/scenes/table/Table.tsx"
const THEME = "site/scenes/table/theme.css"

function setup() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown, query = new URLSearchParams()) =>
    transport({ op, query, body })
  const page = async () => operations.page.response.parse((await call("page")).body)
  const ask = (words: string, path = ROUTE, id = SessionId.parse(crypto.randomUUID())) =>
    call("ask", {
      id,
      words,
      targets: [{ source: { path, line: 7, col: 5 }, owner: ["Pass"], text: "Lisbon" }],
    })
  /** Asks, then lets every variant land and the first one show. */
  const landed = async (words: string, path = ROUTE) => {
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
    const asked = await ask("Draw the flight path")
    expect(asked.status).toBe(200)
    expect(only(operations.ask.response.parse(asked.body)).place).toEqual({ kind: "original" })

    at(10_000)
    const first = only(await page())
    expect(first.place).toEqual({ kind: "original" })
    expect(first.variants.map((variant) => variant.state)).toEqual(["ready", "ready", "ready"])
    expect(shown(ROUTE)).toBe("pass/PassRoute.tsx")

    expect(only(await page()).place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(shown(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v1")
  })

  it("moves through the job phases before the first variant lands", async () => {
    const { page, ask, at } = setup()
    await ask("Draw the flight path")
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
    expect(landed).toBeGreaterThanOrEqual(1500)
    expect(landed).toBeLessThanOrEqual(5000)
  })

  it("flips, then keeps, a variant as its file's new revision and a new version", async () => {
    const { stage, call, landed, kept, shown } = setup()
    const id = await landed("Draw the flight path")
    const flipped = await call("show", { id, variant: "v2" })
    expect(only(operations.show.response.parse(flipped.body)).place).toMatchObject({
      variant: "v2",
    })
    expect(shown(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v2")
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx")

    const reply = await call("keep", { id, variant: "v2" })
    expect(operations.keep.response.parse(reply.body).sessions).toEqual([])
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v2")
    const { versions, at } = stage.snapshot()
    expect(versions.map((version) => version.parent)).toEqual([null, 0])
    expect(at).toBe(1)
  })

  it("reports the file a variant rewrites and its stat against the revision it starts from", async () => {
    const { page, ask, at } = setup()
    await ask("Draw the flight path")
    at(10_000)
    const [a] = only(await page()).variants
    expect(a).toMatchObject({ state: "ready", files: [ROUTE] })
    expect(a?.state === "ready" && a.stat.add + a.stat.del).toBeGreaterThan(0)
  })

  it("refuses a keep of a variant the page does not show", async () => {
    const { call, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Draw the flight path", ROUTE, id)
    const reply = await call("keep", { id, variant: "v3" })
    expect(reply).toEqual({ status: 409, body: { error: { kind: "not-shown", variant: "v3" } } })
  })

  it("snaps free text to the closest recorded ask, and says so on each variant", async () => {
    const { page, ask, at } = setup()
    expect((await ask("could you draw the route please")).status).toBe(200)
    at(10_000)
    const [a] = only(await page()).variants
    expect(a?.state === "ready" && a.summary).toMatch(
      /^Closest recorded ask: “Draw the flight path”\./,
    )
  })

  it("refuses words no recorded ask is close to, naming the asks it has", async () => {
    const { ask } = setup()
    const reply = await ask("make the button blue")
    expect(reply.status).toBe(409)
    expect(reply.body).toMatchObject({ error: { kind: "planner-failed" } })
    expect(JSON.stringify(reply.body)).toContain("Draw the flight path")
  })

  it("suggests the asks of the picked file, and the table's at the board", async () => {
    const { call } = setup()
    const at = async (path: string) =>
      (await call("suggest", undefined, new URLSearchParams({ path }))).body
    expect(await at(ROUTE)).toMatchObject({
      suggestions: expect.arrayContaining([{ words: "Draw the flight path", kind: "house" }]),
    })
    const board = await at(TABLE)
    const styles = manifest.files.get(THEME as never)?.original.asks ?? []
    expect(board).toEqual({
      suggestions: styles.map((node) => ({ words: node.words, kind: "house" })),
      prefill: "Swiss",
    })
  })

  it("offers a part with no asks its object's, and writes the object when asked there", async () => {
    const { call, ask, at } = setup()
    const STUB = "site/scenes/pass/PassStub.tsx"
    const reply = await call("suggest", undefined, new URLSearchParams({ path: STUB }))
    expect(reply.body).toMatchObject({
      suggestions: expect.arrayContaining([{ words: "Departure board", kind: "house" }]),
    })
    expect(reply.body).toMatchObject({ prefill: "Departure board" })
    expect((await ask("Departure board", STUB)).status).toBe(200)
    at(10_000)
    const view = operations.page.response.parse((await call("page")).body)
    const [session] = view.sessions
    expect(session?.variants[0]?.state === "ready" && session.variants[0].files).toEqual([PASS])
  })

  it("answers an ask re-posted with the same id with the session it started", async () => {
    const { page, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Draw the flight path", ROUTE, id)
    await ask("Draw the flight path", ROUTE, id)
    expect((await page()).sessions).toHaveLength(1)
  })

  it("holds a second ask on a shown file: it waits on the first, which a keep leaves stale", async () => {
    const { call, page, landed, kept } = setup()
    const first = await landed("Draw the flight path")
    const second = await landed("Draw the flight path")
    const [older, newer] = (await page()).sessions
    // The newer ask's first variant takes the file, as the bridge ranks it; the older one waits.
    expect(newer?.place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(older?.place).toEqual({
      kind: "waiting",
      variant: "v1",
      on: [{ session: second, variant: "v1", files: [ROUTE] }],
    })
    // Flipping the older one takes the file back.
    await call("show", { id: first, variant: "v3" })
    const [back, held] = (await page()).sessions
    expect(back?.place).toMatchObject({ kind: "shown", variant: "v3" })
    expect(held?.place).toMatchObject({ kind: "waiting", on: [{ session: first, files: [ROUTE] }] })
    // Keeping it rewrites the file under the other, which can no longer move it.
    await call("keep", { id: first, variant: "v3" })
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v3")
    expect(only(await page()).place).toEqual({
      kind: "conflict",
      want: "v1",
      files: [ROUTE],
      showing: null,
    })
    const refused = await call("keep", { id: second, variant: "v1" })
    expect(refused).toEqual({ status: 409, body: { error: { kind: "conflict", files: [ROUTE] } } })
  })

  it("stacks asks on three files: each shows at once, none waits on another", async () => {
    const { page, landed, shown } = setup()
    await landed("Draw the flight path")
    await landed("Departure board", PASS)
    await landed("Swiss", TABLE)
    expect((await page()).sessions.map((session) => session.place)).toEqual([
      { kind: "shown", variant: "v1", edited: false },
      { kind: "shown", variant: "v1", edited: false },
      { kind: "shown", variant: "v1", edited: false },
    ])
    expect([shown(ROUTE), shown(PASS), shown(THEME)]).toEqual([
      "pass/PassRoute.tsx/flight-path:v1",
      "pass/Pass.tsx/departures:v1",
      "table/theme.css/swiss:v1",
    ])
  })

  it("keeps a part through a layout keep, then lays a table style over both", async () => {
    const { stage, call, landed, kept } = setup()
    const route = await landed("Draw the flight path")
    await call("show", { id: route, variant: "v2" })
    await call("keep", { id: route, variant: "v2" })
    const layout = await landed("Departure board", PASS)
    await call("keep", { id: layout, variant: "v1" })
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v2")
    const table = await landed("Swiss", TABLE)
    await call("show", { id: table, variant: "v3" })
    const { shown } = stage.snapshot()
    expect([
      shown.get(ROUTE as never)?.key,
      shown.get(PASS as never)?.key,
      shown.get(THEME as never)?.key,
    ]).toEqual([
      "pass/PassRoute.tsx/flight-path:v2",
      "pass/Pass.tsx/departures:v1",
      "table/theme.css/swiss:v3",
    ])
    await call("keep", { id: table, variant: "v3" })
    expect(stage.snapshot().versions.map((version) => version.kept?.ask.words ?? null)).toEqual([
      null,
      "Draw the flight path",
      "Departure board",
      "Swiss",
    ])
  })

  it("resets to the original, with no history and no open session", async () => {
    const { stage, call, landed, kept } = setup()
    const id = await landed("Draw the flight path")
    await call("keep", { id, variant: "v1" })
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v1")
    await landed("Put it on a map")
    stage.reset()
    expect(stage.snapshot().sessions).toEqual([])
    expect(stage.snapshot().versions).toHaveLength(1)
    expect(kept(PASS)).toBe("pass/Pass.tsx")
  })
})
