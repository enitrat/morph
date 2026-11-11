import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionId, SourceLoc } from "../variant/model"
import { bridge, connect, explain } from "./bridge"

const ID = SessionId.parse("6f1c1f6e-3f0e-4f4e-9d2a-2b1f6c3d4e5f")

const answering = (response: Response) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  )

connect("/__morph/")

afterEach(() => {
  vi.unstubAllGlobals()
})

it("calls the bridge at the path its adapter mounts it on", async () => {
  const fetch = vi.fn(async () => Response.json(null))
  vi.stubGlobal("fetch", fetch)
  await bridge.discard(ID)
  expect(fetch).toHaveBeenCalledWith("/__morph/discard", expect.anything())
})

describe("what the overlay says when the bridge cannot answer", () => {
  it("tells the designer to discard from a terminal when the dev server answers its build error page", async () => {
    answering(
      new Response("<!DOCTYPE html><html>Build Error</html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      }),
    )
    const answer = await bridge.discard(ID)
    expect(answer.ok ? null : explain(answer.error)).toBe(
      "The page doesn't build with this variant. Run pnpm morph discard in a terminal.",
    )
  })

  it("keeps Morph's own crash report when the bridge itself failed", async () => {
    answering(Response.json({ error: { kind: "crashed", detail: "boom" } }, { status: 500 }))
    const answer = await bridge.discard(ID)
    expect(answer.ok ? null : explain(answer.error)).toBe(
      "Morph hit a bug; the edit may have been applied: boom",
    )
  })
})

it("rejects malformed success and error bodies", async () => {
  answering(Response.json({ changed: true }))
  expect((await bridge.discard(ID)).ok).toBe(false)
  answering(Response.json({ error: { kind: "busy" } }, { status: 409 }))
  const failure = await bridge.discard(ID)
  expect(failure.ok ? null : failure.error.kind).toBe("offline")
})

it("names the files another session holds when a write is refused", async () => {
  const other = SessionId.parse("0e7c5f3a-1b2c-4d5e-8f90-a1b2c3d4e5f6")
  answering(
    Response.json(
      {
        error: {
          kind: "held",
          on: [{ session: other, variant: "v2", files: ["app/page.tsx", "app/card.tsx"] }],
        },
      },
      { status: 409 },
    ),
  )
  const answer = await bridge.keep(ID, "v1")
  expect(answer.ok ? null : explain(answer.error)).toBe(
    "Another Ask shows app/page.tsx, app/card.tsx. Discard or keep it first.",
  )
})

it("reads the page every session operation answers", async () => {
  const view = {
    id: ID,
    place: { kind: "shown", variant: "v1", edited: false },
    variants: [],
    trail: [],
    drift: ["app/page.tsx"],
  }
  answering(Response.json({ sessions: [view], stuck: [] }))
  expect(await bridge.show(ID, "v1")).toEqual({ ok: true, value: { sessions: [view], stuck: [] } })
})

describe("a bridge behind an injected transport", () => {
  afterEach(() => connect("/__morph/"))

  it("sends the operation, query and body to the transport and validates what it answers", async () => {
    const calls: unknown[] = []
    connect(async (call) => {
      calls.push({ op: call.op, query: String(call.query), body: call.body })
      return { status: 200, body: { tag: null } }
    })
    const site = SourceLoc.parse({ path: "app/page.tsx", line: 3, col: 5 })
    expect(await bridge.attributes(site)).toEqual({ ok: true, value: { tag: null } })
    await bridge.discard(ID)
    expect(calls).toEqual([
      { op: "attributes", query: "path=app%2Fpage.tsx&line=3&col=5", body: undefined },
      { op: "discard", query: "", body: { id: ID } },
    ])
  })
})
