// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:3000/"}
import { afterEach, expect, it, vi } from "vitest"

import { type Fiber } from "../inspector/fiber"
import { connect } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { invalidateSources, locate, sitesOf } from "./source"

function fiber(lines: number[], owner: Fiber | null = null): Fiber {
  return {
    type: function Example() {},
    return: null,
    child: null,
    memoizedProps: {},
    stateNode: null,
    _debugOwner: owner,
    _debugStack: Object.assign(new Error(), {
      stack: `Error\n${lines.map((line) => `    at X (http://localhost:3000/chunk.js:${line}:1)`).join("\n")}`,
    }),
  }
}

const site = (line: number) => ({ path: `src/${line}.tsx`, line, col: 1 })

afterEach(() => {
  invalidateCatalog()
  invalidateSources()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it("locates ordered fiber slots in batches, retaining empty slots and failed batches", async () => {
  connect("/__tune")
  const batches: string[][] = []
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body: { frames: string[] } = JSON.parse(String(init.body))
    batches.push(body.frames)
    if (batches.length === 2) return Response.json({ error: { kind: "method" } }, { status: 405 })
    return Response.json({
      sources: body.frames.map((frame) => {
        const line = Number(/:(\d+):1$/.exec(frame)?.[1])
        return line % 4 === 1 ? null : site(line)
      }),
    })
  })
  const instances = Array.from({ length: 34 }, (_, i) =>
    i === 1 ? fiber([]) : fiber([i * 4 + 1, i * 4 + 2, i * 4 + 3, i * 4 + 4, 999]),
  )
  const found = await sitesOf(instances)
  expect(batches.map((frames) => frames.length)).toEqual([60, 64, 8])
  expect(found).toHaveLength(34)
  expect(found.slice(0, 4)).toEqual([site(2), null, site(10), site(14)])
  expect(found.slice(16, 32)).toEqual(Array(16).fill(null))
  expect(found.slice(32)).toEqual([site(130), site(134)])
  expect(batches.flat()).not.toContain("http://localhost:3000/chunk.js:999:1")
})

it("keeps the own site while selecting the first non-plumbing owner", async () => {
  connect("/__tune")
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/plumbing"))
      return Response.json({ plumbing: [{ prefix: "src/1", except: [] }] })
    const body: { frames: string[] } = JSON.parse(String(init.body))
    return Response.json({
      sources: body.frames.map((frame) => site(Number(/:(\d+):1$/.exec(frame)?.[1]))),
    })
  })
  const element = document.createElement("button")
  element.textContent = " Hello   there "
  const host = fiber([1], fiber([2]))
  host.type = "button"
  host.stateNode = element
  Object.assign(element, { __reactFiber$test: host })
  expect(await locate(element)).toEqual({
    site: site(1),
    anchor: { source: site(2), owner: ["Example"], text: "Hello there" },
  })
})

it("sends a Server Component frame whose URL Turbopack tagged with (ecmascript) after an edit", async () => {
  connect("/__tune")
  const sent: string[] = []
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body: { frames: string[] } = JSON.parse(String(init.body))
    sent.push(...body.frames)
    return Response.json({ sources: body.frames.map(() => null) })
  })
  const server =
    "about://React/Server/file:///app/.next/dev/server/chunks/ssr/%255Broot%255D__a._.js?id=%255Bproject%255D/tour.tsx+%255Bapp-rsc%255D+(ecmascript)?39:31:433"
  const instance = fiber([])
  instance._debugStack = Object.assign(new Error(), { stack: `Error\n    at Hero (${server})` })
  await sitesOf([instance])
  expect(sent).toEqual([server])
})
