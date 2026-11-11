import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage } from "./stage"
import { type Operation, operations, type PageView, RepoPath, SessionId } from "./wire"

// Skip the demo transport's cosmetic write delay; job progress uses the clock supplied below.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const ROUTE = "site/scenes/pass/PassRoute.tsx"
const PASS = "site/scenes/pass/Pass.tsx"
const TABLE = "site/scenes/table/Table.tsx"
const THEME = "site/scenes/table/theme.css"

function setup() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown, query = new URLSearchParams()) => {
    const pending = transport({ op, query, body })
    await vi.runAllTimersAsync()
    return pending
  }
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
    return id
  }
  const kept = (path: string) => stage.snapshot().kept.get(RepoPath.parse(path))?.key
  const shown = (path: string) => stage.snapshot().shown.get(RepoPath.parse(path))?.key
  return { stage, call, page, ask, landed, kept, shown, at: (ms: number) => (now = ms) }
}

const only = (view: PageView) => {
  const [session] = view.sessions
  if (session?.kind !== "active") throw new Error("no active session")
  return session
}

describe("replay transport", () => {
  it("shows the first ready variant on its first poll after the recorded duration", async () => {
    const { page, ask, at, shown } = setup()
    const asked = await ask("Draw the flight path")
    expect(asked.status).toBe(200)
    expect(only(operations.ask.response.parse(asked.body)).place).toEqual({ kind: "original" })

    at(10_000)
    const first = only(await page())
    expect(first.place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(first.variants.map((variant) => variant.state)).toEqual(["ready", "ready", "ready"])
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
    expect(landed).toBeGreaterThan(0)
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
    expect(reply.body).toMatchObject({ error: { kind: "invalid" } })
    expect(JSON.stringify(reply.body)).toContain("Draw the flight path")
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
    if (session?.kind !== "active") throw new Error("No active session")
    expect(session.variants[0]?.state === "ready" && session.variants[0].files).toEqual([PASS])
  })

  it("answers an ask re-posted with the same id with the session it started", async () => {
    const { page, ask } = setup()
    const id = SessionId.parse(crypto.randomUUID())
    await ask("Draw the flight path", ROUTE, id)
    await ask("Draw the flight path", ROUTE, id)
    expect((await page()).sessions.filter((view) => view.kind === "active")).toHaveLength(1)
  })

  it("holds a second ask on a shown file: it waits on the first, which a keep leaves stale", async () => {
    const { call, page, landed, kept } = setup()
    const first = await landed("Draw the flight path")
    const second = await landed("Draw the flight path")
    const [older, newer] = (await page()).sessions.filter((view) => view.kind === "active")
    // The newer ask's first variant takes the file, as the bridge ranks it; the older one waits.
    expect(newer?.place).toEqual({ kind: "shown", variant: "v1", edited: false })
    expect(older?.place).toEqual({
      kind: "waiting",
      variant: "v1",
      on: [{ session: second, variant: "v1", files: [ROUTE] }],
    })
    // Flipping the older one takes the file back.
    await call("show", { id: first, variant: "v3" })
    const [back, held] = (await page()).sessions.filter((view) => view.kind === "active")
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
    expect(
      (await page()).sessions
        .filter((view) => view.kind === "active")
        .map((session) => session.place),
    ).toEqual([
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
      shown.get(RepoPath.parse(ROUTE))?.key,
      shown.get(RepoPath.parse(PASS))?.key,
      shown.get(RepoPath.parse(THEME))?.key,
    ]).toEqual([
      "pass/PassRoute.tsx/flight-path:v2",
      "pass/Pass.tsx/departures:v1",
      "table/theme.css/swiss:v3",
    ])
    await call("keep", { id: table, variant: "v3" })
    expect([kept(ROUTE), kept(PASS), kept(THEME)]).toEqual([
      "pass/PassRoute.tsx/flight-path:v2",
      "pass/Pass.tsx/departures:v1",
      "table/theme.css/swiss:v3",
    ])
  })

  it("resets to the original, with no history and no open session", async () => {
    const { stage, call, landed, kept, page } = setup()
    const id = await landed("Draw the flight path")
    await call("keep", { id, variant: "v1" })
    expect(kept(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v1")
    await landed("Put it on a map")
    const beforeReset = await page()
    stage.reset()
    expect(stage.snapshot().sessions).toEqual([])
    expect(stage.snapshot().kept).toEqual(manifest.original)
    expect(stage.snapshot().shown).toEqual(manifest.original)
    expect(stage.snapshot().log).toEqual([])
    expect(kept(PASS)).toBe("pass/Pass.tsx")
    const afterReset = await page()
    expect(afterReset.observation).toBeGreaterThan(beforeReset.observation)
    await landed("Draw the flight path")
    expect((await page()).observation).toBeGreaterThan(afterReset.observation)
  })

  it("refuses unsupported refinement or touch replacement before keeping the current round", async () => {
    const { stage, landed } = setup()
    const from = await landed("Draw the flight path")
    const before = stage.snapshot()
    const ask = {
      id: SessionId.parse(crypto.randomUUID()),
      path: "missing.tsx",
      words: "Unsupported",
    }
    expect(stage.refine({ from, variant: "v1", ask }, 20000)).toMatchObject({
      ok: false,
      refusal: { kind: "invalid" },
    })
    expect(stage.snapshot()).toBe(before)
    expect(stage.replace(from, ask, 20000)).toMatchObject({
      ok: false,
      refusal: { kind: "invalid" },
    })
    expect(stage.snapshot()).toBe(before)
  })

  it("validates refinement on the prospective kept revision and observes a repeated successor", async () => {
    const { stage, landed } = setup()
    const from = await landed("Draw the flight path")
    const request = {
      from,
      variant: "v1" as const,
      ask: { id: SessionId.parse(crypto.randomUUID()), path: ROUTE, words: "Put it on a map" },
    }
    const observed: number[] = []
    stage.subscribe(() => observed.push(stage.snapshot().sessions.length))
    expect(stage.refine(request, 20000).ok).toBe(true)
    expect(observed).toEqual([1])
    const next = stage.snapshot()
    expect(stage.refine(request, 20000).ok).toBe(true)
    expect(stage.snapshot()).toBe(next)
    expect(next.sessions).toHaveLength(1)
    expect(next.sessions[0]?.id).toBe(request.ask.id)
    expect(stage.poll(20000).sessions[0]?.thread).toBe(from)
  })
})

it.each(["discard", "keep", "reset"] as const)(
  "does not reopen an acknowledged ask after %s",
  async (close) => {
    const { stage, landed, call, ask, page } = setup()
    const id = await landed("Draw the flight path")
    if (close === "reset") stage.reset()
    else expect((await call(close, { id, variant: "v1" })).status).toBe(200)
    expect((await ask("Draw the flight path", ROUTE, id)).status).toBe(200)
    expect((await page()).sessions).toEqual([])
  },
)

it("acknowledges a closed refinement without reopening it", async () => {
  const { landed, call, page } = setup()
  const from = await landed("Draw the flight path")
  const id = SessionId.parse(crypto.randomUUID())
  const request = {
    from,
    variant: "v1",
    ask: {
      id,
      words: "Put it on a map",
      targets: [{ source: { path: ROUTE, line: 7, col: 5 }, owner: ["Pass"], text: "Lisbon" }],
    },
  }
  expect((await call("refine", request)).status).toBe(200)
  expect((await call("discard", { id })).status).toBe(200)
  expect((await call("refine", request)).status).toBe(200)
  expect((await page()).sessions).toEqual([])
})

it("canceling an unseen request prevents a delayed ask or refinement from opening it", async () => {
  const { landed, call, ask, page } = setup()
  const from = await landed("Draw the flight path")
  const id = SessionId.parse(crypto.randomUUID())
  expect((await call("discard", { id })).status).toBe(200)
  expect((await ask("Draw the flight path", ROUTE, id)).status).toBe(200)
  expect(
    (
      await call("refine", {
        from,
        variant: "v1",
        ask: {
          id,
          words: "Put it on a map",
          targets: [{ source: { path: ROUTE, line: 7, col: 5 }, owner: ["Pass"], text: "Lisbon" }],
        },
      })
    ).status,
  ).toBe(200)
  expect((await page()).sessions.map((session) => session.id)).toEqual([from])
})

it("allows an elapsed variant to be shown without a prior page poll", async () => {
  const { call, ask, at, shown } = setup()
  const id = SessionId.parse(crypto.randomUUID())
  await ask("Draw the flight path", ROUTE, id)
  expect((await call("show", { id, variant: "v1" })).status).toBe(409)
  at(10000)
  expect((await call("show", { id, variant: "v1" })).status).toBe(200)
  expect(shown(ROUTE)).toBe("pass/PassRoute.tsx/flight-path:v1")
})
