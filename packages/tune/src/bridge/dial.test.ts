import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
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
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { RepoPath, SessionId } from "../variant/model"
import { dial } from "./dial"
import config from "./fixtures/acme/tune.config"
import { tuneHandler } from "./handler"
import { operations } from "../protocol"
import { writeJson } from "./disk"
import { homeOf } from "./git"
import { DARK, MODULES, openHost, REPO, SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

const TILE = "apps/site/components/tile.tsx"
const BUTTON = "packages/ui/src/components/atoms/button/button.tokens.css"
const SEMANTIC = "packages/ui/src/tokens/semantic.css"
const TILE_SOURCE = `export function Tile() {
  return <div className="flex gap-2 p-4">tile</div>
}
`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tune-dial-")))
  dirs.push(root)
  for (const path of ["packages/ui/src/tokens", BUTTON, ".oxfmtrc.json"])
    cpSync(join(REPO, path), join(root, path), { recursive: true })
  mkdirSync(dirname(join(root, TILE)), { recursive: true })
  writeFileSync(join(root, TILE), TILE_SOURCE)
  symlinkSync(MODULES, join(root, "node_modules"))
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "tune@example.com")
  sh(root, "config", "user.name", "Tune")
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  return { root, repo: await openHost(root) }
}

const site = { path: RepoPath.parse(TILE), line: 2, col: 10 }
const diff = (root: string) => sh(root, "diff", "--unified=0", "--no-color").split("\n")

describe("dial", () => {
  it("swaps one class at the tag and formats the file; the same write again is a no-op", async () => {
    const { root, repo } = await fixture()

    const first = await dial(repo, { kind: "utility", site, from: "p-4", to: "p-5" })
    const again = await dial(repo, { kind: "utility", site, from: "p-4", to: "p-5" })

    expect(first).toEqual({ ok: true, value: { changed: true, file: TILE } })
    expect(again).toEqual({ ok: true, value: { changed: false, file: TILE } })
    expect(readFileSync(join(root, TILE), "utf8")).toBe(TILE_SOURCE.replace("p-4", "p-5"))
  })

  it("reports an applied HTTP edit when the formatter is missing", async () => {
    const { root } = await fixture()
    const handle = tuneHandler(
      { ...config, checks: { ...config.checks, format: { bin: "missing-formatter", args: [] } } },
      { dir: root, bundler: { symbolicate: async () => [] } },
    )
    vi.stubEnv("NODE_ENV", "development")
    try {
      const response = await handle(
        new Request("http://localhost:3000/api/tune/dial", {
          method: "POST",
          headers: { host: "localhost:3000", "x-tune": "1" },
          body: JSON.stringify({ kind: "utility", site, from: "p-4", to: "p-5" }),
        }),
        "dial",
      )
      expect(response.status).toBe(200)
      const result = operations.dial.response.parse(await response.json())
      expect(result).toMatchObject({
        changed: true,
        file: TILE,
        warning: expect.stringContaining("formatting failed"),
      })
      expect(readFileSync(join(root, TILE), "utf8")).toContain("p-5")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("writes one dark declaration of a role, and leaves light as it was", async () => {
    const { root, repo } = await fixture()
    const write = {
      kind: "token",
      token: "--secondary",
      scope: DARK,
      to: "var(--neutral-700)",
    } as const

    const first = await dial(repo, write)
    const again = await dial(repo, write)

    expect(first).toMatchObject({ ok: true, value: { changed: true, file: SEMANTIC } })
    expect(again).toMatchObject({ ok: true, value: { changed: false } })
    expect(diff(root).filter((line) => /^[-+] /.test(line))).toEqual([
      "-  --secondary: var(--neutral-800);",
      "+  --secondary: var(--neutral-700);",
    ])
  })

  it("refuses a token edit the design-system rules forbid", async () => {
    const { repo } = await fixture()
    const split = await dial(repo, {
      kind: "token",
      token: "--button-secondary-bg",
      scope: DARK,
      to: "var(--accent)",
    })
    expect(split).toMatchObject({ ok: false, kind: "invalid" })
  })

  it("refuses to write while a session is open", async () => {
    const { root, repo } = await fixture()
    const id = SessionId.parse(randomUUID())
    await writeJson(join(homeOf(repo), "sessions", id, "session.json"), {
      id,
      base: "0".repeat(40),
      ask: {
        id,
        words: "x",
        targets: [{ source: site, owner: [], text: "" }],
        marks: [],
        count: 1,
      },
      directions: [{ title: "X", description: "X." }],
    })

    const refused = await dial(repo, { kind: "utility", site, from: "p-4", to: "p-5" })

    expect(refused).toEqual({ ok: false, kind: "busy", session: id })
    expect(readFileSync(join(root, TILE), "utf8")).toBe(TILE_SOURCE)
  })
})
