import { execFileSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import config from "./fixtures/acme/tune.config"
import { retouchRoute } from "./route"

const { GET, POST } = retouchRoute(config)

/** The route serves the checkout it runs in. */
const host = realpathSync(mkdtempSync(join(tmpdir(), "retouch-route-")))
beforeAll(() => {
  execFileSync("git", ["init", "--quiet"], { cwd: host })
  vi.spyOn(process, "cwd").mockReturnValue(host)
})
afterAll(() => {
  rmSync(host, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const context = (op: string) => ({ params: Promise.resolve({ op }) })
const request = (op: string, init: { method?: string; body?: string } = {}) =>
  new Request(`http://localhost:3000/api/retouch/${op}`, {
    ...init,
    headers: { host: "localhost:3000", "x-retouch": "1" },
  })

it("answers 404 outside development before reading the request", async () => {
  vi.stubEnv("NODE_ENV", "production")
  expect((await POST(request("ask", { method: "POST", body: "{}" }), context("ask"))).status).toBe(
    404,
  )
})

it("refuses unknown ops, wrong methods and bodies that are not the domain shape", async () => {
  vi.stubEnv("NODE_ENV", "development")
  expect((await GET(request("nope"), context("nope"))).status).toBe(404)
  expect((await GET(request("ask"), context("ask"))).status).toBe(405)
  const bad = await POST(
    request("show", { method: "POST", body: JSON.stringify({ id: "x", variant: "v9" }) }),
    context("show"),
  )
  expect(bad.status).toBe(400)
  expect(await bad.json()).toMatchObject({ error: { kind: "bad-request" } })
  const foreign = await GET(request("locate?frame=http://evil.example/a.js:1:1"), context("locate"))
  expect(foreign.status).toBe(400)
})
