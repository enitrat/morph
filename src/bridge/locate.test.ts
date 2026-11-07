import { SourceMapGenerator } from "source-map-js"
import { afterEach, expect, it, vi } from "vitest"

import { locate } from "./locate"

const CHUNK = "http://localhost:3000/_next/static/chunks/page.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

function serve(files: Record<string, string>) {
  vi.stubGlobal("fetch", async (url: URL | string) => {
    const body = files[String(url)]
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body)
  })
}

const frame = (line: number, col: number, url = CHUNK) => ({ url: new URL(url), line, col })

it("resolves frames to repo files and leaves libraries and unmapped chunks out", async () => {
  const map = new SourceMapGenerator({ file: "page.js" })
  const at = (line: number, source: string, original: number) => {
    map.addMapping({
      generated: { line, column: 4 },
      original: { line: original, column: 6 },
      source,
    })
  }
  at(3, "file:///repo/apps/site/app/orders/list.tsx", 114)
  at(4, "turbopack:///[project]/packages/ui/src/table.tsx", 195)
  at(5, "turbopack:///[project]/node_modules/.pnpm/react@19/node_modules/react/index.js", 1)
  at(6, "file:///elsewhere/outside.tsx", 2)
  serve({
    [CHUNK]: "code\n//# sourceMappingURL=page.js.map\n",
    [`${CHUNK}.map`]: map.toString(),
    "http://localhost:3000/_next/static/chunks/bare.js": "code without a map",
  })

  expect(
    await locate("/repo", [
      frame(3, 5),
      frame(4, 5),
      frame(5, 5),
      frame(6, 5),
      frame(1, 1, "http://localhost:3000/_next/static/chunks/bare.js"),
    ]),
  ).toEqual([
    { path: "apps/site/app/orders/list.tsx", line: 114, col: 7 },
    { path: "packages/ui/src/table.tsx", line: 195, col: 7 },
    null,
    null,
    null,
  ])
})
