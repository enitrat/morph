import { execFile, execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { afterEach, expect, it, vi } from "vitest"

import { BlobId, RepoPath, SessionId } from "../variant/model"
import { readCheckpoint, withCheckpoint } from "./checkpoint"
import { git, homeOf, openRepo, snapshot, REFS, type Host } from "./git"
import { withLive } from "./live"
import { morphHandler } from "./handler"
import { alive } from "./lock"
import { claimPlan, finishPlan, ownsPlan, queuedPlan, readPlan } from "./planner"
import { ask, discard, openSessions, page, retryPlan } from "./session"
import {
  closeFixtureWorkers,
  completeVariant,
  seedSession,
  CONFIG,
  SPAWNING_TEST_MS,
  waitForSession,
} from "./test-fixtures"
import { slotsRoot } from "./slots"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })
const execute = promisify(execFile)
const hosts: Host[] = []
const beforePath = process.env.PATH
afterEach(async () => {
  for (const repo of hosts.splice(0)) {
    await closeFixtureWorkers(repo)
    rmSync(await slotsRoot(repo), { recursive: true, force: true })
    rmSync(repo.root, { recursive: true, force: true })
  }
  vi.unstubAllEnvs()
  if (beforePath === undefined) delete process.env.PATH
  else process.env.PATH = beforePath
})

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "morph-planner-")))
  const sh = (...args: string[]) => execFileSync("git", args, { cwd: root })
  sh("init", "-q")
  writeFileSync(join(root, "card.tsx"), "export const card = 1\n")
  writeFileSync(join(root, ".gitignore"), ".test-bin\n*.marker\n")
  sh("add", ".")
  sh("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base")
  const bin = join(root, ".test-bin")
  mkdirSync(bin)
  const marker = (name: string) => join(root, `${name}.marker`)
  const mode = (value: "hold" | "success" | "failure") => writeFileSync(marker("mode"), value)
  mode("hold")
  writeFileSync(
    join(bin, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs")
if (process.argv[process.argv.indexOf("--tools") + 1] !== "") process.exit(1)
fs.readFileSync(0, "utf8")
fs.appendFileSync(${JSON.stringify(marker("calls"))}, String(process.pid) + "\\n")
const mode = fs.readFileSync(${JSON.stringify(marker("mode"))}, "utf8")
if (mode === "hold") { process.on("SIGTERM", () => {}); setInterval(() => {}, 1000) }
else console.log(JSON.stringify({ type: "result", is_error: mode === "failure", result: "planner down", structured_output: { directions: [{ title: "One", description: "Does it." }] } }))
`,
    { mode: 0o755 },
  )
  process.env.PATH = `${bin}:${beforePath ?? ""}`
  const repo = { ...(await openRepo(root)), config: CONFIG }
  hosts.push(repo)
  const id = SessionId.parse(randomUUID())
  const request = {
    id,
    words: "change it",
    targets: [
      { source: { path: RepoPath.parse("card.tsx"), line: 1, col: 1 }, owner: [], text: "" },
    ],
    marks: [],
    count: 1,
  }
  const queue = () =>
    withLive(repo, async (tree) => {
      const plan = queuedPlan({
        ask: request,
        parent: null,
        ...(await tree.base()),
        recipe: { config: CONFIG, model: "fixture", deadlineMs: 10000 },
      })
      await tree.publish({ ...tree.rounds, [id]: { kind: "planning", plan } })
      return plan
    })
  const child = async (body: string) => {
    const file = join(bin, `${randomUUID()}.mts`)
    writeFileSync(file, body)
    return execute(process.execPath, ["--import", "tsx", file])
  }
  return { repo, id, request, marker, mode, queue, child, bin }
}

it("returns accepted planning promptly, deduplicates reposts, and discards a resistant planner from another process", async () => {
  const { repo, id, request, marker, child } = await fixture()
  const replies = await Promise.all([ask(repo, request), ask(repo, request)])
  for (const reply of replies)
    expect(reply).toMatchObject({ ok: true, value: { sessions: [{ id, kind: "planning" }] } })
  await vi.waitFor(() => expect(existsSync(marker("calls"))).toBe(true), { timeout: 10000 })
  expect(readFileSync(marker("calls"), "utf8").trim().split("\n")).toHaveLength(1)
  const pid = Number(readFileSync(marker("calls"), "utf8").trim())
  expect(await openSessions(repo)).toEqual([id])
  const cli = new URL("../../dist/morph.js", import.meta.url).pathname
  expect((await execute(process.execPath, [cli, "status"], { cwd: repo.root })).stdout).toContain(
    `session ${id}: planning`,
  )
  await execute(process.execPath, [cli, "gc"], { cwd: repo.root })
  expect(
    (await git(repo.root, ["for-each-ref", "--format=%(refname)", `${REFS}/${id}/`])).toString(),
  ).toContain("base")
  const response =
    await child(`import { discard } from ${JSON.stringify(new URL("./session.ts", import.meta.url).href)};
import { openRepo } from ${JSON.stringify(new URL("./git.ts", import.meta.url).href)};
import { SessionId } from ${JSON.stringify(new URL("../variant/model.ts", import.meta.url).href)};
console.log((await discard(await openRepo(${JSON.stringify(repo.root)}), SessionId.parse(${JSON.stringify(id)}))).ok)`)
  expect(response.stdout.trim()).toBe("true")
  await vi.waitFor(() => expect(alive(pid)).toBe(false))
  expect(existsSync(join(homeOf(repo), "sessions", id))).toBe(false)
  expect(await ask(repo, request)).toMatchObject({ ok: true, value: { sessions: [] } })
})

it("keeps accepted planning alive after the request disconnects", async () => {
  const { repo, id, request, marker } = await fixture()
  vi.stubEnv("NODE_ENV", "development")
  const handle = morphHandler(CONFIG, { dir: repo.root, bundler: { symbolicate: async () => [] } })
  const stop = new AbortController()
  const response = await handle(
    new Request("http://localhost:3000/api/morph/ask", {
      method: "POST",
      headers: { host: "localhost:3000", "x-morph": "1", "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: stop.signal,
    }),
    "ask",
  )
  expect(response.status).toBe(200)
  stop.abort("disconnected")
  await vi.waitFor(() => expect(existsSync(marker("calls"))).toBe(true), { timeout: 10000 })
  const pid = Number(readFileSync(marker("calls"), "utf8").trim())
  expect(alive(pid)).toBe(true)
  expect(await readPlan(repo, id)).toMatchObject({
    kind: "planning",
    plan: { state: { kind: "running" } },
  })
  const cli = new URL("../../dist/morph.js", import.meta.url).pathname
  expect((await execute(process.execPath, [cli, "discard"], { cwd: repo.root })).stdout).toContain(
    `discarded ${id}`,
  )
  await vi.waitFor(() => expect(alive(pid)).toBe(false))
})

it("lets one process claim queued planning and persists its interruption after exit", async () => {
  const { repo, id, queue, child } = await fixture()
  const plan = await queue()
  const source = `import { claimPlan } from ${JSON.stringify(new URL("./planner.ts", import.meta.url).href)};
import { openRepo } from ${JSON.stringify(new URL("./git.ts", import.meta.url).href)};
import { SessionId } from ${JSON.stringify(new URL("../variant/model.ts", import.meta.url).href)};
import { AttemptId } from ${JSON.stringify(new URL("./job.ts", import.meta.url).href)};
console.log((await claimPlan(await openRepo(${JSON.stringify(repo.root)}), SessionId.parse(${JSON.stringify(id)}), AttemptId.parse(${JSON.stringify(plan.attempt)}), process.pid)) !== null)`
  const results = await Promise.all([child(source), child(source)])
  expect(results.map(({ stdout }) => stdout.trim()).sort()).toEqual(["false", "true"])
  expect(await readPlan(repo, id)).toMatchObject({
    kind: "planning",
    plan: { state: { kind: "failed" } },
  })
  expect(await page(repo)).toMatchObject({
    ok: true,
    value: { sessions: [{ kind: "plan-failed" }] },
  })
})

it("retains failure on repost, retries explicitly, and rejects old or closed completion", async () => {
  const { repo, id, request, queue, mode, marker } = await fixture()
  const plan = await queue()
  const owner = await claimPlan(repo, id, plan.attempt, process.pid)
  if (owner === null) throw new Error("Claim failed")
  expect(await finishPlan(repo, owner, { ok: false, reason: "fixture failure" })).toBe(true)
  expect(await ask(repo, request)).toMatchObject({
    ok: true,
    value: { sessions: [{ kind: "plan-failed", reason: "fixture failure" }] },
  })
  expect(existsSync(marker("calls"))).toBe(false)
  mode("success")
  await retryPlan(repo, id)
  expect(await ownsPlan(repo, owner)).toBe(false)
  const result = { ok: true as const, directions: [{ title: "Stale", description: "Stale" }] }
  expect(await finishPlan(repo, owner, result)).toBe(false)
  const session = await waitForSession(repo, id)
  expect(session.directions[0]?.title).toBe("One")
  await discard(repo, id)
  expect(await finishPlan(repo, owner, result)).toBe(false)
  expect((await readCheckpoint(repo)).value.rounds[id]?.kind).toBe("closed")
})

it("recovers queued planning through metadata-only reads without changing live files", async () => {
  const { repo, id, queue, mode } = await fixture()
  mode("success")
  await queue()
  await readPlan(await openRepo(repo.root), id)
  const session = await waitForSession(repo, id)
  expect(session.id).toBe(id)
  writeFileSync(join(repo.root, "card.tsx"), "export const card = 2\n")
  const commit = await snapshot(repo)
  writeFileSync(join(repo.root, "card.tsx"), "export const card = 1\n")
  await completeVariant(repo, id, "v1", {
    kind: "ready",
    commit,
    title: "Two",
    summary: "Changed",
    files: [RepoPath.parse("card.tsx")],
    stat: { add: 1, del: 1 },
    ms: { agent: 0, checks: 0, total: 0 },
  })
  expect(await readPlan(repo, id)).toMatchObject({
    kind: "active",
    jobs: { v1: { state: { kind: "ready" } } },
  })
  expect(readFileSync(join(repo.root, "card.tsx"), "utf8")).toBe("export const card = 1\n")
  expect((await readCheckpoint(repo)).value.journal.leases).toEqual({})
})

it("reports death before planner claim without repeatedly launching it", async () => {
  const { repo, id, request, bin } = await fixture()
  const preload = join(bin, "fail.cjs")
  writeFileSync(
    preload,
    'if (process.argv[1]?.endsWith("planner-runner.js")) throw new Error("bootstrap failed")',
  )
  const before = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = `${before ?? ""} --require=${preload}`
  try {
    await ask(repo, request)
    await vi.waitFor(async () =>
      expect(await readPlan(repo, id)).toMatchObject({
        kind: "planning",
        plan: { state: { kind: "failed" } },
      }),
    )
    const state = (await readCheckpoint(repo)).value.rounds[id]
    await page(repo)
    expect((await readCheckpoint(repo)).value.rounds[id]).toEqual(state)
  } finally {
    if (before === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = before
  }
})

it("persists a log setup failure instead of failing every page poll", async () => {
  const { repo, id, request } = await fixture()
  mkdirSync(join(homeOf(repo), "sessions"), { recursive: true })
  writeFileSync(join(homeOf(repo), "sessions", id), "blocks the log directory")
  expect(await ask(repo, request)).toMatchObject({
    ok: true,
    value: { sessions: [{ kind: "plan-failed", reason: expect.stringContaining("EEXIST") }] },
  })
  const round = (await readCheckpoint(repo)).value.rounds[id]
  expect(await page(repo)).toMatchObject({
    ok: true,
    value: { sessions: [{ kind: "plan-failed" }] },
  })
  expect((await readCheckpoint(repo)).value.rounds[id]).toEqual(round)
})

it("publishes planning completion independently of blocked file recovery", async () => {
  const { repo, id, queue } = await fixture()
  const plan = await queue()
  const dir = join(repo.root, "locked")
  mkdirSync(dir)
  writeFileSync(join(dir, "file"), "before")
  const blob = async (text: string) =>
    BlobId.parse(
      execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repo.root,
        input: text,
        encoding: "utf8",
      }).trim(),
    )
  const moving = [
    {
      path: RepoPath.parse("locked/file"),
      expect: await blob("before"),
      write: await blob("after"),
    },
  ]
  await withCheckpoint(repo, async (store) =>
    store.save({ ...store.value, journal: { ...store.value.journal, moving } }),
  )
  chmodSync(dir, 0o555)
  try {
    const owner = await claimPlan(repo, id, plan.attempt, process.pid)
    if (owner === null) throw new Error("Claim failed")
    expect(
      await finishPlan(repo, owner, {
        ok: true,
        directions: [{ title: "One", description: "Does it." }],
      }),
    ).toBe(true)
    expect((await readCheckpoint(repo)).value.journal.moving).toEqual(moving)
  } finally {
    chmodSync(dir, 0o755)
  }
  await page(repo)
  expect(readFileSync(join(dir, "file"), "utf8")).toBe("after")
  expect((await git(repo.root, ["status", "--porcelain"])).length).toBeGreaterThan(0)
})

it("orders planning and active views by persisted opening order, not storage key order", async () => {
  const { repo, id, request, queue } = await fixture()
  await queue()
  const second = SessionId.parse(randomUUID())
  await seedSession(repo, { ...request, id: second })
  await withCheckpoint(repo, async (store) =>
    store.save({
      ...store.value,
      rounds: Object.fromEntries(Object.entries(store.value.rounds).reverse()),
    }),
  )
  const answer = await page(repo)
  expect(answer.ok && answer.value.sessions.map((view) => view.id)).toEqual([id, second])
})
