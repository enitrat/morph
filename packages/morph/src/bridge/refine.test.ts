import { readPlan } from "./planner"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  Anchor,
  type Ask,
  type Parent,
  RepoPath,
  SessionId,
  trailOf,
  threadOf,
} from "../variant/model"
import { type Host, commitTree } from "./git"
import { variantPrompt } from "./prompt"
import { ask, discard, openSessions, readSession, refine, retryPlan, page, show } from "./session"
import {
  waitForSession,
  closeFixtureWorkers,
  completeVariant,
  openHost,
  SPAWNING_TEST_MS,
} from "./test-fixtures"

import { slotsRoot } from "./slots"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

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
const hosts: Host[] = []
const originalPath = process.env.PATH
afterEach(async () => {
  for (const repo of hosts.splice(0)) {
    await closeFixtureWorkers(repo)
    rmSync(await slotsRoot(repo), { recursive: true, force: true })
  }
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "morph-refine-")))
  dirs.push(dir)
  return dir
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

async function fixture() {
  const root = temp()
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "morph@example.com")
  sh(root, "config", "user.name", "Morph")
  execFileSync("mkdir", ["-p", join(root, "src")])
  writeFileSync(join(root, "src/card.tsx"), "card\n")
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
  const failure = {
    type: "result",
    is_error: true,
    result: "planner down",
    structured_output: null,
  }
  const claude = join(bin, "claude")
  writeFileSync(
    claude,
    `#!/bin/sh
case "$*" in *Read,Edit*) cat > /dev/null; exit 1;; esac
bin=$(dirname "$0")
cat > "$bin/prompt"
echo run >> "$bin/calls"
if [ -f "$bin/fail" ]; then
  echo '${JSON.stringify(failure)}'
else
  echo '${JSON.stringify(planned)}'
fi
`,
  )
  chmodSync(claude, 0o755)
  process.env.PATH = `${bin}:${originalPath ?? ""}`
  const repo = await openHost(root)
  hosts.push(repo)
  return { root, repo, bin }
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

    expect(threadOf(second.session, first)).toBe(first.session)
    expect(threadOf(SessionId.parse(randomUUID()), second)).toBe(first.session)
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

  it("passes project styling rules and refinement context to the variant agent", () => {
    const prompt = variantPrompt(
      request,
      parent,
      { title: "Rows", description: "Use rows." },
      {
        imports: [],
        styleRules: ["Use CSS modules already in this project."],
      },
    )
    expect(prompt).toContain("Use CSS modules already in this project.")
    expect(prompt).toContain("make these cards list rows")
    expect(prompt).toContain("Cards become rows with the price first.")
    expect(prompt).toContain("make the price bigger and bolder")
  })
})

describe("refine", () => {
  it("retains a failed refinement until explicit retry and answers a repost without replanning", async () => {
    const { root, repo, bin } = await fixture()
    const first = SessionId.parse(randomUUID())
    const next = SessionId.parse(randomUUID())
    expect((await ask(repo, askOf(first, "make these cards list rows"))).ok).toBe(true)

    const session = await waitForSession(repo, first)
    if (session === null) throw new Error("the first session was not written")
    const slot = join(temp(), "slot")
    sh(root, "worktree", "add", "--quiet", "--detach", slot, session.base)
    writeFileSync(join(slot, "src/card.tsx"), "card as a row\n")
    const commit = await commitTree(slot, session.base, "v2")
    await completeVariant(repo, first, "v2", {
      kind: "ready",
      commit,
      title: "Compact row, price as lead",
      summary: "Cards become rows.",
      files: [RepoPath.parse("src/card.tsx")],
      stat: { add: 1, del: 1 },
      ms: { agent: 0, checks: 0, total: 0 },
    })

    const request = {
      from: first,
      variant: "v2" as const,
      ask: askOf(next, "make the price bigger"),
    }
    writeFileSync(join(bin, "fail"), "")
    const failed = await refine(repo, request)

    expect(failed).toMatchObject({
      ok: true,
      value: { sessions: [{ id: next, kind: "planning" }] },
    })
    await vi.waitFor(async () =>
      expect(await readPlan(repo, next)).toMatchObject({
        kind: "planning",
        plan: { state: { kind: "failed", reason: "claude failed: planner down" } },
      }),
    )
    expect(await page(repo)).toMatchObject({
      ok: true,
      value: { sessions: [{ id: next, kind: "plan-failed" }] },
    })
    expect(card(root)).toBe("card as a row\n")
    expect(await readSession(repo, first)).toBeNull()
    expect(await openSessions(repo)).toEqual([next])

    unlinkSync(join(bin, "fail"))
    expect(await refine(repo, request)).toMatchObject({
      ok: true,
      value: { sessions: [{ kind: "plan-failed" }] },
    })
    expect(readFileSync(join(bin, "calls"), "utf8").trim().split("\n")).toHaveLength(2)
    await retryPlan(repo, next)
    await waitForSession(repo, next)
    const planned = await page(repo)
    const prompt = readFileSync(join(bin, "prompt"), "utf8")
    expect(prompt).toContain("make these cards list rows")
    expect(prompt).toContain("Cards become rows.")
    expect(prompt).toContain("make the price bigger")
    expect(planned).toMatchObject({
      ok: true,
      value: {
        sessions: [
          {
            id: next,
            place: { kind: "original" },
            trail: [
              {
                variant: "v2",
                title: "Compact row, price as lead",
                feedback: "make the price bigger",
              },
            ],
          },
        ],
      },
    })
    expect(readFileSync(join(bin, "calls"), "utf8").trim().split("\n")).toHaveLength(3)
    const reposted = await refine(repo, request)
    if (!planned.ok || !reposted.ok) throw new Error("Refine refused")
    const { observation: before, ...firstView } = planned.value
    const { observation: after, ...nextView } = reposted.value
    expect(nextView).toEqual(firstView)
    expect(after).toBeGreaterThan(before)
    expect(readFileSync(join(bin, "calls"), "utf8").trim().split("\n")).toHaveLength(3)
    expect(await openSessions(repo)).toEqual([next])

    const round = await readSession(repo, next)
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
