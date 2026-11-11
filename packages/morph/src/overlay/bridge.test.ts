import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionId } from "../variant/model"
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
