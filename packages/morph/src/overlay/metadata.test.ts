// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"

import { connect } from "./bridge"
import { catalogNow, invalidateCatalog, loadTokens } from "./catalog"
import { invalidateSources, locate } from "./source"

connect("/__morph")

afterEach(() => {
  invalidateCatalog()
  invalidateSources()
  vi.unstubAllGlobals()
})

it("retries a failed source lookup and resolves the same element again after a source edit", async () => {
  const element = document.createElement("div")
  Object.assign(element, {
    __reactFiber$test: {
      type: "div",
      memoizedProps: {},
      _debugStack: { stack: `Error\n    at ${location.origin}/app.tsx:1:1` },
    },
  })
  let line = 1
  let failed = true
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/plumbing")) return Response.json({ plumbing: [] })
    if (failed) {
      failed = false
      throw new Error("offline")
    }
    return Response.json({ sources: [{ path: "app.tsx", line, col: 1 }] })
  })
  vi.stubGlobal("fetch", fetch)

  expect((await locate(element)).site).toBeNull()
  expect((await locate(element)).site?.line).toBe(1)
  line = 2
  const [first, second] = await Promise.all([locate(element), locate(element)])
  expect(first.site?.line).toBe(2)
  expect(second.site?.line).toBe(2)
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/locate"))).toHaveLength(3)
})

const tokens = (title: string) => ({
  files: [],
  themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
  plumbing: [],
  components: [
    {
      slug: "card",
      title,
      group: "ui",
      naming: "own",
      href: null,
      importFrom: null,
      exports: ["Card"],
      namedExports: ["Card"],
      files: [],
      reads: [],
      childReads: [],
      props: { kind: "none" },
    },
  ],
})

describe("token metadata", () => {
  it("shares an in-flight fetch and refreshes the catalog on the next load", async () => {
    let title = "First"
    const fetch = vi.fn(async () => Response.json(tokens(title)))
    vi.stubGlobal("fetch", fetch)
    await Promise.all([loadTokens(), loadTokens()])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(catalogNow().get("Card")?.title).toBe("First")
    title = "Second"
    await loadTokens()
    expect(catalogNow().get("Card")?.title).toBe("Second")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not let a pre-write response replace a newer catalog", async () => {
    let finish: (response: Response) => void = () => {
      throw new Error("request missing")
    }
    let calls = 0
    vi.stubGlobal("fetch", () => {
      calls++
      if (calls === 1)
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      return Promise.resolve(Response.json(tokens("New")))
    })
    const old = loadTokens()
    invalidateCatalog()
    await loadTokens()
    finish(Response.json(tokens("Old")))
    await old
    expect(catalogNow().get("Card")?.title).toBe("New")
  })
})
