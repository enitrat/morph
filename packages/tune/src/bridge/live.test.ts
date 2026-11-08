import { execFileSync, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { afterEach, describe, expect, it, vi } from "vitest"

import { EMPTY_JOURNAL, Seq, SessionId, type Target, type VariantId } from "../variant/model"
import { type Offer, type Request } from "../variant/swap"
import { changedFiles, commitTree, homeOf, openRepo, type Repo, snapshot } from "./git"
import { baseOf, converge, readJournal } from "./live"
import { withLock } from "./lock"
import { SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

type Tree = Record<string, string>

const lines = (label: string) =>
  Array.from({ length: 8 }, (_, index) => `${label} ${index + 1}\n`).join("")
const edit = (text: string, line: number, to: string) =>
  text
    .split("\n")
    .map((current, index) => (index === line - 1 ? to : current))
    .join("\n")

const BASE: Tree = {
  "src/a.tsx": lines("a"),
  "src/b.tsx": lines("b"),
  "src/c.tsx": lines("c"),
  "src/deep/d.tsx": lines("d"),
}
const ALL = [...Object.keys(BASE), "src/new/notice.tsx"]

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tune-live-")))
  dirs.push(dir)
  return dir
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

function write(root: string, files: Record<string, string | null>) {
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path)
    if (text === null) rmSync(file)
    else {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
    }
  }
}

function read(root: string, paths: readonly string[]): Record<string, string | null> {
  return Object.fromEntries(
    paths.map((path) => {
      const file = join(root, path)
      return [path, existsSync(file) ? readFileSync(file, "utf8") : null]
    }),
  )
}

async function fixture() {
  const root = temp()
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "tune@example.com")
  sh(root, "config", "user.name", "Tune")
  write(root, BASE)
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  const repo = await openRepo(root)
  const base = await snapshot(repo)

  /** Builds a variant the way a slot does: edit a worktree of the base, commit its tree. */
  async function variant(
    session: SessionId,
    id: VariantId,
    edits: Record<string, string | null>,
  ): Promise<Target> {
    const dir = join(temp(), "slot")
    sh(root, "worktree", "add", "--quiet", "--detach", dir, base)
    write(dir, edits)
    const commit = await commitTree(dir, base, id)
    return { session, variant: id, base, commit, files: await changedFiles(repo, base, commit) }
  }
  return { root, repo, variant }
}

const id = () => SessionId.parse(randomUUID())
const offer = (session: SessionId, opened: number, ...ready: Target[]): Offer => ({
  session,
  opened: Seq.parse(opened),
  ready,
})

/** Converges `request` against a fixed set of open sessions, failing the test on a refusal. */
async function run(repo: Repo, offers: readonly Offer[], request: Request) {
  const done = await converge(repo, async () => offers, request)
  if (!done.ok) throw new Error(`refused: ${JSON.stringify(done.refusal)}`)
  return Object.fromEntries(done.places)
}

describe("converge", () => {
  it("does not touch any file when the shown variant is shown again or the page settles", async () => {
    const { root, repo, variant } = await fixture()
    const s = id()
    const offers = [
      offer(s, 1, await variant(s, "v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })),
    ]
    await run(repo, offers, { kind: "show", session: s, choice: "v1" })
    const file = statSync(join(root, "src/a.tsx"))

    await run(repo, offers, { kind: "show", session: s, choice: "v1" })
    const journal = statSync(join(homeOf(repo), "live.json"))
    await run(repo, offers, { kind: "settle" })

    const after = statSync(join(root, "src/a.tsx"))
    expect([after.ino, after.mtimeMs]).toEqual([file.ino, file.mtimeMs])
    const settled = statSync(join(homeOf(repo), "live.json"))
    expect([settled.ino, settled.mtimeMs]).toEqual([journal.ino, journal.mtimeMs])
  })

  it("finishes a takeover across two sessions that crashed between the journal and the files", async () => {
    const { root, repo, variant } = await fixture()
    const [s, t] = [id(), id()]
    const header = await variant(s, "v1", {
      "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "S"),
      "src/b.tsx": edit(BASE["src/b.tsx"]!, 2, "S"),
    })
    const card = await variant(t, "v1", {
      "src/b.tsx": edit(BASE["src/b.tsx"]!, 6, "T"),
      "src/deep/d.tsx": edit(BASE["src/deep/d.tsx"]!, 2, "T"),
      "src/new/notice.tsx": "export const Notice = 1\n",
    })
    const offers = [offer(s, 1, header), offer(t, 2, card)]
    await run(repo, offers, { kind: "show", session: s, choice: "v1" })

    chmodSync(join(root, "src/deep"), 0o555)
    const crashed = converge(repo, async () => offers, { kind: "show", session: t, choice: "v1" })
    await expect(crashed).rejects.toThrow()
    chmodSync(join(root, "src/deep"), 0o755)
    expect((await readJournal(repo)).moving).toHaveLength(4)
    expect(read(root, ["src/a.tsx", "src/deep/d.tsx"])).toEqual({
      "src/a.tsx": BASE["src/a.tsx"],
      "src/deep/d.tsx": BASE["src/deep/d.tsx"],
    })

    expect(await run(repo, offers, { kind: "settle" })).toEqual({
      [s]: { kind: "waiting", on: [{ session: t, variant: "v1", files: ["src/b.tsx"] }] },
      [t]: { kind: "shown", variant: "v1" },
    })
    expect(read(root, ALL)).toEqual({
      ...BASE,
      "src/b.tsx": edit(BASE["src/b.tsx"]!, 6, "T"),
      "src/deep/d.tsx": edit(BASE["src/deep/d.tsx"]!, 2, "T"),
      "src/new/notice.tsx": "export const Notice = 1\n",
    })
    expect(await readJournal(repo)).toMatchObject({ moving: null, stuck: [] })

    await run(repo, offers, { kind: "discard", session: t })
    await run(repo, offers, { kind: "discard", session: s })
    expect(read(root, ALL)).toEqual({ ...BASE, "src/new/notice.tsx": null })
    expect(existsSync(join(root, "src/new"))).toBe(false)
  })

  it("holds a call until the operation holding the lock releases it", async () => {
    const { root, repo, variant } = await fixture()
    const s = id()
    const offers = [
      offer(s, 1, await variant(s, "v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })),
    ]

    const held = await withLock(join(homeOf(repo), "lock"), async () => {
      const call = run(repo, offers, { kind: "show", session: s, choice: "v1" })
      await sleep(300)
      expect(read(root, ["src/a.tsx"])["src/a.tsx"]).toBe(BASE["src/a.tsx"])
      return { call }
    })

    expect(await held.call).toEqual({ [s]: { kind: "shown", variant: "v1" } })
    expect(read(root, ["src/a.tsx"])["src/a.tsx"]).toBe(edit(BASE["src/a.tsx"]!, 2, "A"))
  })

  it("breaks a lock left by a dead process", async () => {
    const { repo, variant } = await fixture()
    const s = id()
    const offers = [
      offer(s, 1, await variant(s, "v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })),
    ]
    const dead = spawnSync("true").pid
    mkdirSync(join(homeOf(repo), "lock"), { recursive: true })
    writeFileSync(join(homeOf(repo), "lock", "pid"), String(dead))

    expect(await run(repo, offers, { kind: "settle" })).toEqual({
      [s]: { kind: "shown", variant: "v1" },
    })
  })
})

describe("baseOf", () => {
  it("takes every shown variant out of a new base and keeps the designer's edits", async () => {
    const { root, repo, variant } = await fixture()
    const [s, t] = [id(), id()]
    const offers = [
      offer(s, 1, await variant(s, "v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "S") })),
      offer(t, 2, await variant(t, "v1", { "src/b.tsx": edit(BASE["src/b.tsx"]!, 2, "T") })),
    ]
    await run(repo, offers, { kind: "settle" })
    write(root, {
      "src/a.tsx": edit(read(root, ["src/a.tsx"])["src/a.tsx"]!, 7, "mine"),
      "src/c.tsx": edit(BASE["src/c.tsx"]!, 1, "mine"),
    })

    const first = await baseOf(repo)
    const second = await baseOf(repo)

    expect(second.opened).toBe(first.opened + 1)
    expect(sh(root, "show", `${first.base}:src/a.tsx`)).toBe(edit(BASE["src/a.tsx"]!, 7, "mine"))
    expect(sh(root, "show", `${first.base}:src/b.tsx`)).toBe(BASE["src/b.tsx"])
    expect(sh(root, "show", `${first.base}:src/c.tsx`)).toBe(edit(BASE["src/c.tsx"]!, 1, "mine"))
    expect(read(root, ["src/a.tsx", "src/b.tsx"])).toEqual({
      "src/a.tsx": edit(edit(BASE["src/a.tsx"]!, 2, "S"), 7, "mine"),
      "src/b.tsx": edit(BASE["src/b.tsx"]!, 2, "T"),
    })
  })
})

describe("worktrees", () => {
  it("keep their own journal: a variant shown in one is not shown in another", async () => {
    const { root, repo, variant } = await fixture()
    const other = join(temp(), "other")
    sh(root, "worktree", "add", "--quiet", "--detach", other)
    const s = id()
    const offers = [
      offer(s, 1, await variant(s, "v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })),
    ]
    await run(repo, offers, { kind: "settle" })

    const elsewhere = await openRepo(other)

    expect(homeOf(elsewhere)).not.toBe(homeOf(repo))
    expect(await readJournal(elsewhere)).toEqual(EMPTY_JOURNAL)
    expect(await readJournal(repo)).toMatchObject({
      leases: { "src/a.tsx": { session: s, variant: "v1" } },
    })
  })
})
