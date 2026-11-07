import { execFileSync, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
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

import { SessionId, type Target, type VariantId } from "../variant/model"
import { planSwap } from "../variant/swap"
import { changedFiles, commitTree, gitStore, homeOf, openRepo, snapshot } from "./git"
import { keep, readJournal, setLive } from "./live"
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

const BASE: Tree = { "src/a.tsx": lines("a"), "src/b.tsx": lines("b"), "src/c.tsx": lines("c") }

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "retouch-live-")))
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
  const session = SessionId.parse(randomUUID())

  /** Builds a variant the way a slot does: edit a worktree of the base, commit its tree. */
  async function variant(id: VariantId, edits: Record<string, string | null>): Promise<Target> {
    const dir = join(temp(), "slot")
    sh(root, "worktree", "add", "--quiet", "--detach", dir, base)
    write(dir, edits)
    const commit = await commitTree(dir, base, id)
    return { session, variant: id, base, commit, files: await changedFiles(repo, base, commit) }
  }
  return { root, repo, session, variant }
}

const ALL = [...Object.keys(BASE), "src/new/notice.tsx"]

describe("setLive", () => {
  it("does not touch any file when the shown variant is shown again", async () => {
    const { root, repo, variant } = await fixture()
    const a = await variant("v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })
    await setLive(repo, a)
    const stamp = statSync(join(root, "src/a.tsx"))

    const again = await setLive(repo, a)

    expect(again.ok).toBe(true)
    const after = statSync(join(root, "src/a.tsx"))
    expect([after.ino, after.mtimeMs]).toEqual([stamp.ino, stamp.mtimeMs])
  })

  it("finishes a swap that crashed between the journal and the writes, then discards to the base", async () => {
    const { root, repo, variant } = await fixture()
    const a = await variant("v1", {
      "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A"),
      "src/b.tsx": edit(BASE["src/b.tsx"]!, 2, "A"),
    })
    const b = await variant("v2", {
      "src/a.tsx": edit(BASE["src/a.tsx"]!, 5, "B"),
      "src/c.tsx": null,
      "src/new/notice.tsx": "export const Notice = 1\n",
    })
    const shown = await setLive(repo, a)
    if (!shown.ok) throw new Error("show A conflicted")
    const plan = await planSwap(gitStore(repo), shown.applied, b)
    if (!plan.ok) throw new Error("A to B conflicted")
    expect(plan.writes.length).toBeGreaterThanOrEqual(3)
    writeFileSync(
      join(homeOf(repo), "live.json"),
      JSON.stringify({ kind: "moving", to: plan.to, writes: plan.writes }),
    )
    const [first] = plan.writes
    write(root, { [first!.path]: first!.write && sh(root, "cat-file", "blob", first!.write) })

    expect(await setLive(repo, b)).toMatchObject({ ok: true })
    expect(read(root, ALL)).toEqual({
      ...BASE,
      "src/a.tsx": edit(BASE["src/a.tsx"]!, 5, "B"),
      "src/c.tsx": null,
      "src/new/notice.tsx": "export const Notice = 1\n",
    })
    await setLive(repo, null)
    expect(read(root, ALL)).toEqual({ ...BASE, "src/new/notice.tsx": null })
    expect(existsSync(join(root, "src/new"))).toBe(false)
  })

  it("holds a call until the operation holding the lock releases it", async () => {
    const { root, repo, variant } = await fixture()
    const a = await variant("v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })

    const held = await withLock(join(homeOf(repo), "lock"), async () => {
      const call = setLive(repo, a)
      await sleep(300)
      expect(read(root, ["src/a.tsx"])["src/a.tsx"]).toBe(BASE["src/a.tsx"])
      return { call }
    })

    expect(await held.call).toMatchObject({ ok: true })
    expect(read(root, ["src/a.tsx"])["src/a.tsx"]).toBe(edit(BASE["src/a.tsx"]!, 2, "A"))
  })

  it("breaks a lock left by a dead process", async () => {
    const { repo, variant } = await fixture()
    const a = await variant("v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })
    const dead = spawnSync("true").pid
    mkdirSync(join(homeOf(repo), "lock"), { recursive: true })
    writeFileSync(join(homeOf(repo), "lock", "pid"), String(dead))

    expect(await setLive(repo, a)).toMatchObject({ ok: true })
  })
})

describe("worktrees", () => {
  it("keep their own journal: a variant shown in one is not shown in another", async () => {
    const { root, repo, variant } = await fixture()
    const other = join(temp(), "other")
    sh(root, "worktree", "add", "--quiet", "--detach", other)
    const a = await variant("v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })
    await setLive(repo, a)

    const elsewhere = await openRepo(other)

    expect(homeOf(elsewhere)).not.toBe(homeOf(repo))
    expect(await readJournal(elsewhere)).toEqual({ kind: "steady", applied: null })
    expect(await readJournal(repo)).toMatchObject({ kind: "steady", applied: { variant: "v1" } })
  })
})

describe("keep", () => {
  it("leaves the shown files in place and makes a later discard a no-op", async () => {
    const { root, repo, session, variant } = await fixture()
    const a = await variant("v1", { "src/a.tsx": edit(BASE["src/a.tsx"]!, 2, "A") })
    await setLive(repo, a)

    await keep(repo, session)
    await keep(repo, session)

    expect(await setLive(repo, null)).toEqual({ ok: true, applied: null })
    expect(read(root, ["src/a.tsx"])["src/a.tsx"]).toBe(edit(BASE["src/a.tsx"]!, 2, "A"))
  })
})
