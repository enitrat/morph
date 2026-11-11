import { execFileSync } from "node:child_process"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createServer, type ViteDevServer } from "vite"
import { afterEach, expect, it, vi } from "vitest"

import { openRepo } from "../bridge/git"
import { slotsRoot } from "../bridge/slots"
import config from "../bridge/fixtures/acme/morph.config"
import { closeFixtureWorkers, MODULES, REPO, SPAWNING_TEST_MS } from "../bridge/test-fixtures"
import { bridge, connect } from "../overlay/bridge"
import { Ask, SessionId, SourceLoc } from "../variant/model"
import { morph } from "./index.js"

let server: ViteDevServer | undefined
let root: string | undefined

afterEach(async () => {
  if (server) {
    const current = await bridge.page()
    if (current.ok) for (const session of current.value.sessions) await bridge.discard(session.id)
  }
  await server?.close()
  server = undefined
  if (root) {
    await closeFixtureWorkers(await openRepo(root))
    rmSync(await slotsRoot(await openRepo(root)), { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
  root = undefined
  vi.unstubAllEnvs()
})

async function serve(inject = true) {
  vi.stubEnv("NODE_ENV", "development")
  root = realpathSync(mkdtempSync(join(tmpdir(), "morph-vite-")))
  cpSync(REPO, root, { recursive: true })
  mkdirSync(join(root, "node_modules/@enitrat"), { recursive: true })
  symlinkSync(join(MODULES, ".."), join(root, "node_modules/@enitrat/morph"))
  symlinkSync(join(MODULES, ".bin"), join(root, "node_modules/.bin"))
  symlinkSync(join(MODULES, "react"), join(root, "node_modules/react"))
  symlinkSync(join(MODULES, "@types"), join(root, "node_modules/@types"))
  writeFileSync(join(root, "index.html"), "<html><body><h1>My app</h1></body></html>")
  writeFileSync(
    join(root, "card.tsx"),
    'export const Card = () => <div className="p-4">Hello</div>\n',
  )
  execFileSync("git", ["init", "--quiet"], { cwd: root })
  server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [
      morph(
        {
          ...config,
          checks: {
            ...config.checks,
            typecheck: {
              bin: "tsc",
              args: ["--noEmit", "--skipLibCheck", "--jsx", "react-jsx", "card.tsx"],
              scope: "root",
            },
          },
        },
        { base: "/__design", inject },
      ),
    ],
    server: { host: "127.0.0.1", port: 0 },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === "string") throw new Error("Vite did not listen on TCP")
  const origin = `http://127.0.0.1:${address.port}`
  connect(`${origin}/__design/`)
  return { origin, root }
}

it(
  "serves the widget and lets the overlay read and edit source through a custom bridge path",
  async () => {
    const { origin, root } = await serve()
    const html = await (await fetch(origin)).text()
    expect(html).toContain("<h1>My app</h1>")
    const widget = /<script[^>]+src="([^"]*virtual:morph)"/.exec(html)?.[1]
    expect(widget).toBeDefined()
    const module = await fetch(new URL(widget ?? "", origin))
    const source = await module.text()
    expect(module.status, source).toBe(200)
    expect(module.headers.get("content-type")).toContain("javascript")

    const site = SourceLoc.parse({ path: "card.tsx", line: 1, col: 26 })
    expect(await bridge.tag(site)).toEqual({ ok: true, value: { classes: ["p-4"] } })
    expect(await bridge.dial({ kind: "utility", site, from: "p-4", to: "p-5" })).toEqual({
      ok: true,
      value: { changed: true, file: "card.tsx" },
    })
    expect(readFileSync(join(root, "card.tsx"), "utf8")).toContain('className="p-5"')
    expect(await bridge.tag(site)).toEqual({ ok: true, value: { classes: ["p-5"] } })

    const refused = await fetch(`${origin}/__design/dial`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "utility", site, from: "p-5", to: "p-6" }),
    })
    expect(refused.status).toBe(403)
    expect(await bridge.tag(site)).toEqual({ ok: true, value: { classes: ["p-5"] } })
  },
  SPAWNING_TEST_MS,
)

it(
  "keeps the bridge available when automatic widget injection is disabled",
  async () => {
    const { origin } = await serve(false)
    const html = await (await fetch(origin)).text()
    expect(html).toContain("<h1>My app</h1>")
    expect(html).not.toContain("virtual:morph")
    expect(await bridge.page()).toEqual({
      ok: true,
      value: { observation: expect.any(Number), sessions: [], stuck: [] },
    })
  },
  SPAWNING_TEST_MS,
)

it(
  "generates checked variants in real workers, flips and keeps one, then discards a later exploration",
  async () => {
    const { root } = await serve()
    const bin = join(root, ".test-bin")
    mkdirSync(bin)
    // Only the external agent is scripted. It edits its actual worktree and reports its tool writes.
    writeFileSync(
      join(bin, "claude"),
      `#!/usr/bin/env node
const fs = require("node:fs")
const prompt = fs.readFileSync(0, "utf8")
const schema = JSON.parse(process.argv[process.argv.indexOf("--json-schema") + 1])
const emit = (event) => console.log(JSON.stringify(event))
if (schema.properties.directions) {
  emit({ type: "result", structured_output: { directions: (prompt.includes("roomier again") ? [9, 10, 11] : [6, 7, 8]).map(n => ({
    title: "Space " + n, description: "Use padding step " + n
  })) } })
} else {
  const step = /padding step ([0-9]+)/.exec(prompt)?.[1]
  if (!step) process.exit(1)
  const source = fs.readFileSync("card.tsx", "utf8").replace(/p-[0-9]+/, "p-" + step)
  fs.writeFileSync("card.tsx", source)
  emit({ type: "assistant", message: { content: [{
    type: "tool_use", name: "Edit", input: { file_path: "card.tsx" }
  }] } })
  emit({ type: "result", structured_output: { title: "Space " + step, summary: "More room." } })
}
`,
      { mode: 0o755 },
    )
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`)
    writeFileSync(join(root, ".gitignore"), "node_modules\n.test-bin\n")
    execFileSync("git", ["add", "."], { cwd: root })
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"],
      { cwd: root },
    )
    const explore = async (words: string) => {
      const id = SessionId.parse(crypto.randomUUID())
      const asked = await bridge.ask(
        Ask.parse({
          id,
          words,
          targets: [
            { source: { path: "card.tsx", line: 1, col: 26 }, owner: ["Card"], text: "Hello" },
          ],
          marks: [],
          count: 3,
        }),
      )
      expect(asked.ok).toBe(true)
      await vi.waitFor(
        async () => {
          const answer = await bridge.page()
          expect(answer.ok).toBe(true)
          if (!answer.ok) return
          const view = answer.value.sessions.find((entry) => entry.id === id)
          expect(
            view?.kind === "active" ? view.variants : undefined,
            JSON.stringify(view),
          ).toMatchObject([
            { state: "ready", files: ["card.tsx"] },
            { state: "ready", files: ["card.tsx"] },
            { state: "ready", files: ["card.tsx"] },
          ])
        },
        { timeout: 15_000, interval: 100 },
      )
      return id
    }
    const first = await explore("Give this card more room")
    expect((await bridge.show(first, "v2")).ok).toBe(true)
    expect(readFileSync(join(root, "card.tsx"), "utf8")).toContain('className="p-7"')
    expect(await bridge.keep(first, "v2")).toEqual({
      ok: true,
      value: { observation: expect.any(Number), sessions: [], stuck: [] },
    })
    const kept = readFileSync(join(root, "card.tsx"), "utf8")

    const second = await explore("Make it roomier again")
    expect((await bridge.show(second, "v1")).ok).toBe(true)
    expect(readFileSync(join(root, "card.tsx"), "utf8")).toContain('className="p-9"')
    expect(await bridge.discard(second)).toEqual({
      ok: true,
      value: { observation: expect.any(Number), sessions: [], stuck: [] },
    })
    expect(readFileSync(join(root, "card.tsx"), "utf8")).toBe(kept)
  },
  SPAWNING_TEST_MS,
)
