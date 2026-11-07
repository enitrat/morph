import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionId } from "../variant/model"
import { bridge, connect, explain } from "./bridge"

const ID = SessionId.parse("6f1c1f6e-3f0e-4f4e-9d2a-2b1f6c3d4e5f")

const answering = (response: Response) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  )

connect("/__tune/")

afterEach(() => {
  vi.unstubAllGlobals()
})

it("calls the bridge at the path its adapter mounts it on", async () => {
  const fetch = vi.fn(async () => Response.json(null))
  vi.stubGlobal("fetch", fetch)
  await bridge.discard(ID)
  expect(fetch).toHaveBeenCalledWith("/__tune/discard", expect.anything())
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
      "The page doesn't build with this variant. Run pnpm tune discard in a terminal.",
    )
  })

  it("keeps Tune's own crash report when the bridge itself failed", async () => {
    answering(Response.json({ error: { kind: "crashed", detail: "boom" } }, { status: 500 }))
    const answer = await bridge.discard(ID)
    expect(answer.ok ? null : explain(answer.error)).toBe("Tune hit a bug and wrote nothing: boom")
  })
})
