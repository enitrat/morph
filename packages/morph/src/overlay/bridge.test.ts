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

it("rejects malformed variant and attribute responses", async () => {
  const session = { id: ID, place: { kind: "original" }, variants: [], trail: [], drift: [] }
  const page = (view: object) => Response.json({ sessions: [view], stuck: [] })
  const direction = { title: "Option", description: "Change the layout" }
  for (const variant of [
    { id: "v1", direction, state: "pending", phase: "unknown" },
    {
      id: "v1",
      direction,
      state: "ready",
      title: "Ready",
      summary: "Done",
      files: ["../escape"],
      stat: { add: 1, del: 0 },
    },
    { id: "v1", direction, state: "failed", reason: "failed", retryable: "yes" },
  ]) {
    answering(page({ ...session, variants: [variant] }))
    const answer = await bridge.page()
    expect(answer.ok ? null : answer.error.kind).toBe("offline")
  }
  answering(page({ ...session, trail: [{ variant: "v1", title: "kept" }] }))
  const trail = await bridge.page()
  expect(trail.ok ? null : trail.error.kind).toBe("offline")
  answering(page({ ...session, place: { kind: "waiting", variant: "v1", on: [] } }))
  const waiting = await bridge.page()
  expect(waiting.ok ? null : waiting.error.kind).toBe("offline")

  const site = SourceLoc.parse({ path: "src/app.tsx", line: 1, col: 1 })
  for (const attribute of [
    { kind: "attribute", name: "open", value: { kind: "literal", value: 1 } },
    { kind: "attribute", name: "open", value: { kind: "unknown" } },
    { kind: "unknown" },
  ]) {
    answering(Response.json({ tag: { name: "Button", attributes: [attribute] } }))
    const answer = await bridge.attributes(site)
    expect(answer.ok ? null : answer.error.kind).toBe("offline")
  }
})

it("rejects malformed application refusals", async () => {
  for (const error of [
    { kind: "held", on: [] },
    { kind: "not-shown", variant: "original" },
    { kind: "not-ready", variant: "v4" },
    { kind: "conflict", files: ["../escape"] },
    { kind: "planner-failed", detail: 1 },
    { kind: "invalid" },
  ]) {
    answering(Response.json({ error }, { status: 409 }))
    const answer = await bridge.discard(ID)
    expect(answer.ok ? null : answer.error.kind).toBe("offline")
  }
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
