import { execFileSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { RepoPath } from "../variant/model"
import config from "./fixtures/acme/tune.config"
import { tuneHandler } from "./handler"
import { type Bundler } from "./symbolicate"

const dir = realpathSync(mkdtempSync(join(tmpdir(), "tune-handler-")))
const bundler: Bundler = {
  symbolicate: async (_, frames) =>
    frames.map(({ line, col }) => ({ path: RepoPath.parse("app/page.tsx"), line, col })),
}
const handle = tuneHandler(config, { bundler, dir })

beforeAll(() => {
  execFileSync("git", ["init", "--quiet"], { cwd: dir })
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const call = (op: string, init: { method?: string; body?: string } = {}) =>
  handle(
    new Request(`http://localhost:3000/api/tune/${op}`, {
      ...init,
      headers: { host: "localhost:3000", "x-tune": "1" },
    }),
    op,
  )

it("answers 404 outside development before reading the request", async () => {
  vi.stubEnv("NODE_ENV", "production")
  expect((await call("ask", { method: "POST", body: "{}" })).status).toBe(404)
})

it("refuses unknown ops, wrong methods and bodies that are not the domain shape", async () => {
  vi.stubEnv("NODE_ENV", "development")
  expect((await call("nope")).status).toBe(404)
  expect((await call("ask")).status).toBe(405)
  const bad = await call("show", {
    method: "POST",
    body: JSON.stringify({ id: "x", variant: "v9" }),
  })
  expect(bad.status).toBe(400)
  expect(await bad.json()).toMatchObject({ error: { kind: "bad-request" } })
})

it("answers the page, and no longer answers a single session", async () => {
  vi.stubEnv("NODE_ENV", "development")
  const answer = await call("page")
  expect(answer.status).toBe(200)
  expect(await answer.json()).toEqual({ sessions: [], stuck: [] })
  expect((await call("session")).status).toBe(404)
})

it("symbolicates frames of this dev server and Server Component frames, and no others", async () => {
  vi.stubEnv("NODE_ENV", "development")
  const frame = (text: string) =>
    call("locate", { method: "POST", body: JSON.stringify({ frames: [text] }) })
  expect((await frame("http://evil.example/a.js:1:1")).status).toBe(400)
  expect((await frame("file:///etc/passwd:1:1")).status).toBe(400)
  const own = await frame("http://localhost:3000/_next/static/chunks/a.js:3:4")
  expect(await own.json()).toEqual({ sources: [{ path: "app/page.tsx", line: 3, col: 4 }] })
  const server = await frame("about://React/Server/file:///repo/.next/a.js?7:5:6")
  expect(await server.json()).toEqual({ sources: [{ path: "app/page.tsx", line: 5, col: 6 }] })
})
