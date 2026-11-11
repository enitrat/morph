import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { RepoPath } from "../variant/model"
import config from "./fixtures/acme/morph.config"
import { homeOf, openRepo } from "./git"
import { morphHandler } from "./handler"
import { type Bundler } from "./symbolicate"

const dir = realpathSync(mkdtempSync(join(tmpdir(), "morph-handler-")))
const bundler: Bundler = {
  symbolicate: async (_, frames) =>
    frames.map(({ line, col }) => ({ path: RepoPath.parse("app/page.tsx"), line, col })),
}
const handle = morphHandler(config, { bundler, dir })

beforeAll(() => {
  execFileSync("git", ["init", "--quiet"], { cwd: dir })
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const call = (
  op: string,
  init: { method?: string; body?: string } = {},
  query = "",
  using = handle,
) =>
  using(
    new Request(`http://localhost:3000/api/morph/${op}${query === "" ? "" : `?${query}`}`, {
      ...init,
      headers: { host: "localhost:3000", "x-morph": "1" },
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

it("suggests the house prompts of the component at a site, the asks open on its file, then the prompts for all", async () => {
  vi.stubEnv("NODE_ENV", "development")
  const suggesting = morphHandler(
    {
      ...config,
      prompts: {
        PricingCard: ["Compare three plans", "Make it feel premium"],
        Footer: ["Never offered here"],
        "*": ["Make it feel premium", "Apply the empty-state guidelines"],
      },
    },
    { bundler, dir },
  )
  writeFileSync(
    join(dir, "pricing.tsx"),
    `export function PricingCard() {\n  return (\n    <section className="card">Pro</section>\n  )\n}\nexport const Footer = () => <footer />\n`,
  )
  const home = homeOf(await openRepo(dir))
  const anchor = (path: string) => ({ source: { path, line: 3, col: 5 }, owner: [], text: "" })
  const open = (
    n: number,
    path: string,
    words: string,
    { marks = [], parent = null }: { marks?: object[]; parent?: object | null } = {},
  ) => {
    const id = `00000000-0000-4000-8000-00000000000${n}`
    const file = join(home, "sessions", id, "session.json")
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({
        id,
        base: "a".repeat(40),
        opened: n,
        ask: { id, words, targets: [anchor(path)], marks, count: 3 },
        directions: [{ title: "One", description: "Does it." }],
        parent,
      }),
    )
    return id
  }
  const refined = open(1, "pricing.tsx", "Tighten the spacing", {
    parent: {
      session: "00000000-0000-4000-8000-000000000009",
      variant: "v1",
      title: "Calm",
      summary: "Calmer.",
      words: "Calmer",
      parent: null,
    },
  })
  open(2, "footer.tsx", "Only for the footer")
  open(3, "pricing.tsx", "Add a monthly switch")
  open(4, "pricing.tsx", "Move this there", {
    marks: [{ kind: "note", at: anchor("pricing.tsx"), text: "here" }],
  })
  const suggest = async (query: string) => (await call("suggest", {}, query, suggesting)).json()

  expect(await suggest("path=pricing.tsx&line=3&col=5")).toEqual({
    suggestions: [
      { words: "Compare three plans", kind: "house" },
      { words: "Make it feel premium", kind: "house" },
      { words: "Add a monthly switch", kind: "recent" },
      { words: "Tighten the spacing", kind: "recent" },
      { words: "Calmer", kind: "recent" },
      { words: "Apply the empty-state guidelines", kind: "house" },
    ],
  })
  expect(await suggest(`session=${refined}`)).toEqual({
    suggestions: [
      { words: "Make it feel premium", kind: "house" },
      { words: "Apply the empty-state guidelines", kind: "house" },
    ],
  })
  expect(await suggest("path=../etc/passwd&line=1&col=1")).toMatchObject({
    error: { kind: "bad-request" },
  })
})
