import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { SourceMapGenerator } from "source-map-js"
import { afterAll, afterEach, expect, it, vi } from "vitest"

import { nextBundler } from "./symbolicate"

const CHUNK = "http://localhost:3000/_next/static/chunks/page.js"
const root = realpathSync(mkdtempSync(join(tmpdir(), "tune-next-")))
const app = join(root, "apps/site")

afterEach(() => {
  vi.unstubAllGlobals()
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function serve(files: Record<string, string>) {
  vi.stubGlobal("fetch", async (url: URL | string) => {
    const body = files[String(url)]
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body)
  })
}

function mapOf(file: string, sources: Record<number, [string, number]>): string {
  const map = new SourceMapGenerator({ file })
  for (const [line, [source, original]] of Object.entries(sources))
    map.addMapping({
      generated: { line: Number(line), column: 4 },
      original: { line: original, column: 6 },
      source,
    })
  return map.toString()
}

const symbolicate = (frames: { url: string; line: number; col: number }[]) =>
  nextBundler(app).symbolicate(root, frames)

it("resolves client frames to repo files and leaves libraries and unmapped chunks out", async () => {
  serve({
    [CHUNK]: "code\n//# sourceMappingURL=page.js.map\n",
    [`${CHUNK}.map`]: mapOf("page.js", {
      3: [pathToFileURL(join(app, "app/orders/list.tsx")).href, 114],
      4: ["turbopack:///[project]/packages/ui/src/table.tsx [app-client] (ecmascript)", 195],
      5: ["turbopack:///[project]/node_modules/.pnpm/react@19/node_modules/react/index.js", 1],
      6: ["file:///elsewhere/outside.tsx", 2],
      7: ["webpack://_N_E/./app/orders/row.tsx?3a1f", 9],
    }),
    "http://localhost:3000/_next/static/chunks/bare.js": "code without a map",
  })
  const frame = (line: number, url = CHUNK) => ({ url, line, col: 5 })

  expect(
    await symbolicate([
      frame(3),
      frame(4),
      frame(5),
      frame(6),
      frame(7),
      frame(1, "http://localhost:3000/_next/static/chunks/bare.js"),
    ]),
  ).toEqual([
    { path: "apps/site/app/orders/list.tsx", line: 114, col: 7 },
    { path: "packages/ui/src/table.tsx", line: 195, col: 7 },
    null,
    null,
    { path: "apps/site/app/orders/row.tsx", line: 9, col: 7 },
    null,
  ])
})

it("resolves a Server Component frame through the server chunk on disk", async () => {
  const chunks = join(app, ".next/dev/server/chunks/ssr")
  mkdirSync(chunks, { recursive: true })
  writeFileSync(
    join(chunks, "[root]__a._.js"),
    "code\n//# sourceMappingURL=%5Broot%5D__a._.js.map\n",
  )
  writeFileSync(
    join(chunks, "[root]__a._.js.map"),
    mapOf("[root]__a._.js", { 2: ["turbopack:///[project]/apps/site/app/page.tsx", 12] }),
  )
  const url = `about://React/Server/${pathToFileURL(join(chunks, "[root]__a._.js")).href}?7`

  expect(await symbolicate([{ url, line: 2, col: 5 }])).toEqual([
    { path: "apps/site/app/page.tsx", line: 12, col: 7 },
  ])
  expect(
    await symbolicate([{ url: "about://React/Server/file:///etc/hosts?1", line: 1, col: 1 }]),
  ).toEqual([null])
})
