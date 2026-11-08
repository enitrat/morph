import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { Anchor, type Ask, SessionId, VariantId } from "../variant/model"
import { writeJson } from "./disk"
import { changedFiles, commitTree, type Host } from "./git"
import { ask, discard, jobDir, keep, page, readSessionFile, show } from "./session"
import { openHost, SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

const lines = (label: string) =>
  Array.from({ length: 8 }, (_, index) => `${label} ${index + 1}\n`).join("")
const edit = (text: string, line: number, to: string) =>
  text
    .split("\n")
    .map((current, index) => (index === line - 1 ? to : current))
    .join("\n")

const BASE = {
  "app/page.tsx": lines("page"),
  "src/header.tsx": lines("header"),
  "src/card.tsx": lines("card"),
}
type Path = keyof typeof BASE

const dirs: string[] = []
const originalPath = process.env.PATH
afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tune-sessions-")))
  dirs.push(dir)
  return dir
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

const ANCHOR = Anchor.parse({
  source: { path: "app/page.tsx", line: 1, col: 1 },
  owner: ["Page"],
  text: "",
})
const { signal } = new AbortController()

/** A repo with a fake `claude` on PATH that logs when each planner run starts and ends. */
async function fixture() {
  const root = temp()
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "tune@example.com")
  sh(root, "config", "user.name", "Tune")
  write(root, BASE)
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  const bin = temp()
  const planned = {
    type: "result",
    is_error: false,
    structured_output: {
      directions: [1, 2, 3].map((n) => ({ title: `Direction ${n}`, description: "Does it." })),
    },
  }
  const claude = join(bin, "claude")
  writeFileSync(
    claude,
    `#!/bin/sh
cat > /dev/null
bin=$(dirname "$0")
echo start >> "$bin/calls"
if [ -f "$bin/slow" ]; then sleep 1; fi
echo end >> "$bin/calls"
echo '${JSON.stringify(planned)}'
`,
  )
  chmodSync(claude, 0o755)
  process.env.PATH = `${bin}:${originalPath ?? ""}`
  const repo = await openHost(root)
  return { root, repo, bin, ...helpers(root, repo) }
}

function helpers(root: string, repo: Host) {
  return {
    /** Opens a session whose jobs never run: each variant already failed, until `ready`. */
    async open(words = "change it") {
      const id = SessionId.parse(randomUUID())
      for (const variant of VariantId.options)
        await writeJson(join(jobDir(repo, id, variant), "result.json"), {
          kind: "failed",
          reason: "interrupted",
          retryable: true,
        })
      const request: Ask = { id, words, targets: [ANCHOR], marks: [], count: 3 }
      const asked = await ask(repo, request, signal)
      if (!asked.ok) throw new Error(`ask refused: ${JSON.stringify(asked)}`)
      return id
    },

    /** Finishes `variant` the way a runner does: edits a worktree of the base and commits it. */
    async ready(id: SessionId, variant: VariantId, edits: Partial<Record<Path, string>>) {
      const session = await readSessionFile(repo, id)
      if (session === null) throw new Error("no session")
      const slot = join(temp(), "slot")
      sh(root, "worktree", "add", "--quiet", "--detach", slot, session.base)
      write(slot, edits)
      const commit = await commitTree(slot, session.base, variant)
      await writeJson(join(jobDir(repo, id, variant), "result.json"), {
        kind: "ready",
        commit,
        title: `${variant} title`,
        summary: "Done.",
        files: await changedFiles(repo, session.base, commit),
        stat: { add: 1, del: 1 },
        ms: { agent: 0, checks: 0, total: 0 },
      })
    },

    read: (path: Path) => readFileSync(join(root, path), "utf8"),

    async places() {
      const answer = await page(repo)
      if (!answer.ok) throw new Error("the page refused")
      return Object.fromEntries(answer.value.sessions.map(({ id, place }) => [id, place]))
    },
  }
}

describe("several sessions", () => {
  it("plans two asks at once", async () => {
    const { repo, bin, open } = await fixture()
    writeFileSync(join(bin, "slow"), "")

    const [first, second] = await Promise.all([open("one"), open("two")])

    expect(readFileSync(join(bin, "calls"), "utf8").split("\n")).toEqual([
      "start",
      "start",
      "end",
      "end",
      "",
    ])
    const answer = await page(repo)
    expect(answer.ok && answer.value.sessions.map(({ id }) => id).toSorted()).toEqual(
      [first, second].toSorted(),
    )
  })

  it("shows two sessions whose files are disjoint at once", async () => {
    const { open, ready, read, places } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header") })
    await ready(card, "v1", { "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card") })

    expect(await places()).toEqual({
      [header]: { kind: "shown", variant: "v1", edited: false },
      [card]: { kind: "shown", variant: "v1", edited: false },
    })
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
    expect(read("src/card.tsx")).toBe(edit(BASE["src/card.tsx"], 2, "card"))
  })

  it("gives a shared file to the newest flip, and back to the waiting session when the holder is discarded", async () => {
    const { repo, open, ready, read } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header"),
    })
    await ready(card, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 7, "card"),
      "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card"),
    })
    await show(repo, header, "v1")

    const taken = await show(repo, card, "v1")

    expect(taken.ok && taken.value.sessions.map(({ place }) => place)).toEqual([
      {
        kind: "waiting",
        variant: "v1",
        on: [{ session: card, variant: "v1", files: ["app/page.tsx"] }],
      },
      { kind: "shown", variant: "v1", edited: false },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 7, "card"))
    expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])

    const discarded = await discard(repo, card)

    expect(discarded.ok && discarded.value.sessions).toMatchObject([
      { id: header, place: { kind: "shown", variant: "v1" } },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header"))
    expect(read("src/card.tsx")).toBe(BASE["src/card.tsx"])
  })

  it("keeps the holder and brings the waiting session back merged onto the kept code, listing the drift", async () => {
    const { repo, open, ready, read } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", { "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header") })
    await ready(card, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 7, "card"),
      "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card"),
    })
    await show(repo, card, "v1")
    await show(repo, header, "v1")

    const kept = await keep(repo, header, "v1")

    expect(kept).toEqual({
      ok: true,
      value: {
        sessions: [
          expect.objectContaining({
            id: card,
            place: { kind: "shown", variant: "v1", edited: false },
            drift: ["app/page.tsx"],
          }),
        ],
        stuck: [],
      },
    })
    expect(read("app/page.tsx")).toBe(edit(edit(BASE["app/page.tsx"], 2, "header"), 7, "card"))
    await discard(repo, card)
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header"))
  })

  it("keeps a waiting session by taking its files over", async () => {
    const { repo, open, ready, read, places } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header"),
    })
    await ready(card, "v1", { "app/page.tsx": edit(BASE["app/page.tsx"], 2, "card") })
    await show(repo, header, "v1")
    await show(repo, card, "v1")
    expect((await places())[header]).toMatchObject({ kind: "waiting" })

    const kept = await keep(repo, header, "v1")

    expect(kept.ok && kept.value.sessions).toMatchObject([
      { id: card, place: { kind: "conflict", want: "v1", files: ["app/page.tsx"], showing: null } },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header"))
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
  })

  it("refuses a keep that names a variant the session does not show", async () => {
    const { repo, open, ready, read, places } = await fixture()
    const header = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "one") })
    await ready(header, "v2", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "two") })
    await show(repo, header, "v1")

    expect(await keep(repo, header, "v2")).toEqual({
      ok: false,
      kind: "not-shown",
      variant: "v2",
    })
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "one"))
    expect(await places()).toEqual({ [header]: { kind: "shown", variant: "v1", edited: false } })
  })

  it("bases a new ask on the page without another session's shown variant", async () => {
    const { root, repo, open, ready, read } = await fixture()
    const header = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header") })
    await page(repo)
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
    write(root, { "src/card.tsx": edit(BASE["src/card.tsx"], 5, "mine") })

    const next = await open()

    const base = (await readSessionFile(repo, next))?.base
    expect(sh(root, "show", `${base}:src/header.tsx`)).toBe(BASE["src/header.tsx"])
    expect(sh(root, "show", `${base}:src/card.tsx`)).toBe(edit(BASE["src/card.tsx"], 5, "mine"))
  })
})
