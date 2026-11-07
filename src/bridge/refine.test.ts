import { execFileSync, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { Anchor, type Ask, type Parent, SessionId, trailOf } from "../variant/model"
import { runClaude } from "./agent"
import { writeJson } from "./disk"
import { commitTree } from "./git"
import { plannerPrompt, variantPrompt } from "./prompt"
import { ask, discard, jobDir, openSessions, readSessionFile, refine, show } from "./session"
import { openHost, SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

vi.mock("./agent", async (original) => ({
  ...(await original<typeof import("./agent")>()),
  runClaude: vi.fn(),
}))

/** Runners are not started: each job gets the pid of a process that already exited. */
const DEAD = spawnSync("true").pid
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>()
  return {
    ...real,
    spawn: (command: string, ...rest: unknown[]): unknown =>
      command === process.execPath
        ? { pid: DEAD, unref: () => undefined }
        : Reflect.apply(real.spawn, undefined, [command, ...rest]),
  }
})

const planner = vi.mocked(runClaude)
const PLANNED = {
  ok: true as const,
  writes: [],
  value: {
    directions: [1, 2, 3].map((n) => ({ title: `Direction ${n}`, description: "Does it." })),
  },
}

const ANCHOR = Anchor.parse({
  source: { path: "src/card.tsx", line: 1, col: 1 },
  owner: ["Card"],
  text: "",
})
const askOf = (id: SessionId, words: string): Ask => ({
  id,
  words,
  targets: [ANCHOR],
  marks: [],
  count: 3,
})

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "retouch-refine-")))
  dirs.push(dir)
  return dir
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

async function fixture() {
  const root = temp()
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "tune@example.com")
  sh(root, "config", "user.name", "Tune")
  execFileSync("mkdir", ["-p", join(root, "src")])
  writeFileSync(join(root, "src/card.tsx"), "card\n")
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  return { root, repo: await openHost(root) }
}

const card = (root: string) => readFileSync(join(root, "src/card.tsx"), "utf8")
const { signal } = new AbortController()

describe("the trail of a round", () => {
  it("lists each kept variant oldest first, with the feedback the next round asked of it", () => {
    const first: Parent = {
      session: SessionId.parse(randomUUID()),
      variant: "v2",
      title: "Compact row, price as lead",
      summary: "Cards become rows.",
      words: "make these cards list rows",
      parent: null,
    }
    const second: Parent = {
      session: SessionId.parse(randomUUID()),
      variant: "v1",
      title: "Bold price",
      summary: "The price is larger.",
      words: "make the price bigger",
      parent: first,
    }

    expect(trailOf("make these cards list rows", null)).toEqual([])
    expect(trailOf("tighter spacing", second)).toEqual([
      { variant: "v2", title: "Compact row, price as lead", feedback: "make the price bigger" },
      { variant: "v1", title: "Bold price", feedback: "tighter spacing" },
    ])
  })
})

describe("the prompts of a refine round", () => {
  const parent: Parent = {
    session: SessionId.parse(randomUUID()),
    variant: "v2",
    title: "Compact row, price as lead",
    summary: "Cards become rows with the price first.",
    words: "make these cards list rows",
    parent: null,
  }
  const request = askOf(SessionId.parse(randomUUID()), "make the price bigger and bolder")

  it("carry the original words, the kept variant and the feedback, and start from the code", () => {
    for (const prompt of [
      plannerPrompt(request, parent),
      variantPrompt(request, parent, { title: "Bold", description: "Bolder." }, { imports: [] }),
    ]) {
      expect(prompt).toContain("make these cards list rows")
      expect(prompt).toContain(
        'Kept "Compact row, price as lead": Cards become rows with the price first.',
      )
      expect(prompt).toContain(
        'Their feedback on "Compact row, price as lead": make the price bigger and bolder',
      )
      expect(prompt).toContain("already contains the kept variant")
    }
    expect(plannerPrompt(request, parent)).toContain("differ only in how they apply the feedback")
    expect(plannerPrompt(request, null)).not.toContain("kept variant")
  })
})

describe("refine", () => {
  it("keeps the variant, plans again after a failed planner, and answers a re-post the same", async () => {
    const { root, repo } = await fixture()
    const first = SessionId.parse(randomUUID())
    planner.mockResolvedValue(PLANNED)
    expect((await ask(repo, askOf(first, "make these cards list rows"), signal)).ok).toBe(true)

    const session = await readSessionFile(repo, first)
    if (session === null) throw new Error("the first session was not written")
    const slot = join(temp(), "slot")
    sh(root, "worktree", "add", "--quiet", "--detach", slot, session.base)
    writeFileSync(join(slot, "src/card.tsx"), "card as a row\n")
    const commit = await commitTree(slot, session.base, "v2")
    await writeJson(join(jobDir(repo, first, "v2"), "result.json"), {
      kind: "ready",
      commit,
      title: "Compact row, price as lead",
      summary: "Cards become rows.",
      files: ["src/card.tsx"],
      stat: { add: 1, del: 1 },
      ms: { agent: 0, checks: 0, total: 0 },
    })

    const next = SessionId.parse(randomUUID())
    const request = { from: first, variant: "v2" as const, ask: askOf(next, "make the price bigger") }
    planner.mockResolvedValueOnce({ ok: false, detail: "planner down" })
    const failed = await refine(repo, request, signal)

    expect(failed).toMatchObject({ ok: false, kind: "planner-failed" })
    expect(card(root)).toBe("card as a row\n")
    expect(await readSessionFile(repo, first)).toBeNull()
    expect(await openSessions(repo)).toEqual([])

    const planned = await refine(repo, request, signal)
    expect(planned).toMatchObject({
      ok: true,
      value: {
        id: next,
        trail: [
          { variant: "v2", title: "Compact row, price as lead", feedback: "make the price bigger" },
        ],
      },
    })
    const calls = planner.mock.calls.length
    expect(await refine(repo, request, signal)).toEqual(planned)
    expect(planner.mock.calls.length).toBe(calls)
    expect(await openSessions(repo)).toEqual([next])

    const round = await readSessionFile(repo, next)
    expect(round?.parent).toMatchObject({
      session: first,
      variant: "v2",
      words: "make these cards list rows",
    })
    expect(sh(root, "show", `${round?.base}:src/card.tsx`)).toBe("card as a row\n")

    await show(repo, next, "original")
    expect(card(root)).toBe("card as a row\n")
    expect((await discard(repo, next)).ok).toBe(true)
    expect(card(root)).toBe("card as a row\n")
    expect(await openSessions(repo)).toEqual([])
  })
})
