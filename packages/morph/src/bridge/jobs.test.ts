import { execFile, execFileSync, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { afterEach, expect, it, vi } from "vitest"

import { MorphConfig } from "../core/config"
import { Anchor, BlobId, type JobResult, RepoPath, SessionId } from "../variant/model"
import { readCheckpoint, withCheckpoint } from "./checkpoint"
import { writeJson } from "./disk"
import { git, homeOf, type Host, openRepo, snapshot, variantRef } from "./git"
import { advanceJob, claimJob, finishJob, ownsJob, queuedJob, readJobs } from "./jobs"
import { alive } from "./lock"
import { withLive } from "./live"
import { discard, page, retry } from "./session"
import { acquire, release, slotsRoot } from "./slots"
import { closeFixtureWorkers, CONFIG, seedSession, SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })
const execute = promisify(execFile)
const fixtures: Host[] = []
const previousPath = process.env.PATH
const anchor = Anchor.parse({ source: { path: "card.tsx", line: 1, col: 1 }, owner: [], text: "" })

afterEach(async () => {
  for (const repo of fixtures.splice(0)) {
    await closeFixtureWorkers(repo)
    rmSync(await slotsRoot(repo), { recursive: true, force: true })
    rmSync(repo.root, { recursive: true, force: true })
  }
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
})

async function fixture(mode: "agent" | "checks" = "agent", seed = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "morph-owned-jobs-")))
  const sh = (...args: string[]) => execFileSync("git", args, { cwd: root })
  sh("init", "--quiet")
  sh("config", "user.email", "test@example.com")
  sh("config", "user.name", "Test")
  writeFileSync(join(root, "card.tsx"), "export const card = 1\n")
  writeFileSync(join(root, ".gitignore"), "node_modules\n.test-bin\n*.marker\n")
  sh("add", ".")
  sh("commit", "--quiet", "-m", "base")
  const bin = join(root, ".test-bin")
  mkdirSync(bin)
  const marker = (name: string) => join(root, `${name}.marker`)
  const hold = (name: string) => `
fs.writeFileSync(${JSON.stringify(marker(name + "-started"))}, String(process.pid))
fs.writeFileSync(${JSON.stringify(marker(name + "-slot"))}, process.cwd())
process.on("SIGTERM", () => {})
setInterval(() => {}, 1000)
`
  writeFileSync(
    join(bin, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs")
fs.readFileSync(0, "utf8")
${
  mode === "agent"
    ? hold("agent")
    : `
fs.writeFileSync("card.tsx", "export const card = 2\\n")
console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "card.tsx" } }] } }))
console.log(JSON.stringify({ type: "result", structured_output: { title: "Two", summary: "Changed." } }))
`
}
`,
    { mode: 0o755 },
  )
  const commands = join(root, "node_modules", ".bin")
  mkdirSync(commands, { recursive: true })
  writeFileSync(
    join(commands, "hold-check"),
    `#!/usr/bin/env node\nconst fs = require("node:fs")\n${hold("checks")}`,
    { mode: 0o755 },
  )
  process.env.PATH = `${bin}:${previousPath ?? ""}`
  const repo: Host = {
    ...(await openRepo(root)),
    config: MorphConfig.parse({
      ...CONFIG,
      components: [],
      plumbing: [],
      checks: {
        lint: null,
        format: { bin: "hold-check", args: [] },
        typecheck: { bin: "unused", args: [], scope: "root" },
      },
    }),
  }
  fixtures.push(repo)
  const id = SessionId.parse(randomUUID())
  const request = { id, words: "change it", targets: [anchor], marks: [], count: 1 }
  if (seed) await seedSession(repo, request)
  const queue = async () => {
    const job = queuedJob(repo.config)
    await withLive(repo, async (tree) => {
      const round = tree.rounds[id]
      if (round?.kind !== "active") throw new Error("No active fixture")
      await tree.publish({ ...tree.rounds, [id]: { ...round, jobs: { v1: job } } })
    })
    return job.attempt
  }
  const child = async (body: string) => {
    const file = join(bin, `${randomUUID()}.mts`)
    writeFileSync(file, body)
    return execute(process.execPath, ["--import", "tsx", file])
  }
  return { repo, id, request, queue, child, marker }
}

it("lets exactly one process claim queued work and persists interruption after its exit", async () => {
  const { repo, id, queue, child } = await fixture()
  const attempt = await queue()
  const code = `import { claimJob } from ${JSON.stringify(new URL("./jobs.ts", import.meta.url).href)};
import { openRepo } from ${JSON.stringify(new URL("./git.ts", import.meta.url).href)};
import { SessionId } from ${JSON.stringify(new URL("../variant/model.ts", import.meta.url).href)};
import { AttemptId } from ${JSON.stringify(new URL("./job.ts", import.meta.url).href)};
console.log((await claimJob(await openRepo(${JSON.stringify(repo.root)}), SessionId.parse(${JSON.stringify(id)}), "v1", AttemptId.parse(${JSON.stringify(attempt)}), process.pid)) !== null)`
  const claimed = await Promise.all([child(code), child(code)])
  expect(claimed.map(({ stdout }) => stdout.trim()).sort()).toEqual(["false", "true"])
  expect((await readJobs(repo, id))?.v1?.state).toMatchObject({
    kind: "failed",
    reason: "interrupted",
  })
  expect(await page(repo)).toMatchObject({
    ok: true,
    value: {
      sessions: [{ variants: [{ state: "failed", reason: "interrupted", retryable: true }] }],
    },
  })
  expect((await readCheckpoint(repo)).value.rounds[id]).toMatchObject({
    jobs: { v1: { attempt, state: { kind: "failed" } } },
  })
})

it("rejects the old attempt after retry, including phase and Git ref publication", async () => {
  const { repo, id, queue } = await fixture()
  const owner = await claimJob(repo, id, "v1", await queue(), process.pid)
  if (owner === null) throw new Error("Claim refused")
  expect(await finishJob(repo, owner, { kind: "failed", reason: "retry", retryable: true })).toBe(
    true,
  )
  expect((await retry(repo, id, "v1")).ok).toBe(true)
  const round = (await readCheckpoint(repo)).value.rounds[id]
  expect(round?.kind === "active" && round.jobs.v1?.attempt).not.toBe(owner.attempt)
  expect(await advanceJob(repo, owner, "capture")).toBe(false)
  expect(await finishJob(repo, owner, ready(owner.session.base))).toBe(false)
  expect(await ownsJob(repo, owner)).toBe(false)
  expect(
    (
      await git(repo.root, ["for-each-ref", "--format=%(refname)", variantRef(id, "v1")])
    ).toString(),
  ).toBe("")
})

it("fences completion racing closure and never recreates closed artifacts", async () => {
  const { repo, id, queue } = await fixture()
  const owner = await claimJob(repo, id, "v1", await queue(), process.pid)
  if (owner === null) throw new Error("Claim refused")
  await Promise.all([finishJob(repo, owner, ready(owner.session.base)), discard(repo, id)])
  expect(await finishJob(repo, owner, ready(owner.session.base))).toBe(false)
  expect(await advanceJob(repo, owner, "capture")).toBe(false)
  expect(existsSync(join(homeOf(repo), "sessions", id))).toBe(false)
  expect(
    (
      await git(repo.root, ["for-each-ref", "--format=%(refname)", variantRef(id, "v1")])
    ).toString(),
  ).toBe("")
  expect(await page(repo)).toMatchObject({ ok: true, value: { sessions: [] } })
})

it.each(["agent", "checks"] as const)(
  "recovers queued work on reopen and revokes its TERM-resistant %s child before reusing the slot",
  async (mode) => {
    const { repo, id, queue, child, marker } = await fixture(mode)
    await queue()
    expect((await page(await openRepo(repo.root))).ok).toBe(true)
    await vi.waitFor(() => expect(existsSync(marker(`${mode}-started`))).toBe(true), {
      timeout: 10_000,
    })
    const result =
      await child(`import { discard } from ${JSON.stringify(new URL("./session.ts", import.meta.url).href)};
import { openRepo } from ${JSON.stringify(new URL("./git.ts", import.meta.url).href)};
import { SessionId } from ${JSON.stringify(new URL("../variant/model.ts", import.meta.url).href)};
console.log((await discard(await openRepo(${JSON.stringify(repo.root)}), SessionId.parse(${JSON.stringify(id)}))).ok)`)
    expect(result.stdout.trim()).toBe("true")
    const pid = Number(readFileSync(marker(`${mode}-started`), "utf8"))
    const dir = readFileSync(marker(`${mode}-slot`), "utf8")
    await vi.waitFor(() => expect(readdirSync(`${dir}.lock`)).toEqual([]), { timeout: 5000 })
    expect(alive(pid)).toBe(false)
    const round = (await readCheckpoint(repo)).value.rounds[id]
    expect(round?.kind).toBe("closed")
    const base = await snapshot(repo)
    const slot = await acquire(repo, base)
    try {
      expect(slot.dir).toBe(dir)
      expect(alive(pid)).toBe(false)
    } finally {
      await release(slot)
    }
    expect(existsSync(join(homeOf(repo), "sessions", id))).toBe(false)
    expect(await page(repo)).toMatchObject({ ok: true, value: { sessions: [] } })
  },
)

it("refuses to adopt a live legacy runner, then exposes its dead unfinished job for retry", async () => {
  const { repo, id, request } = await fixture("agent", false)
  const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  const exited = new Promise<void>((resolve) => worker.once("exit", () => resolve()))
  try {
    if (worker.pid === undefined) throw new Error("Worker did not start")
    const dir = join(homeOf(repo), "sessions", id)
    await writeJson(join(dir, "session.json"), {
      id,
      ask: request,
      base: await snapshot(repo),
      opened: 1,
      directions: [{ title: "One", description: "Does it." }],
      parent: null,
    })
    mkdirSync(join(dir, "jobs", "v1"), { recursive: true })
    writeFileSync(join(dir, "jobs", "v1", "pid"), String(worker.pid))
    await expect(page(repo)).rejects.toThrow("wait for the legacy worker")
    expect(existsSync(join(homeOf(repo), "checkpoint.json"))).toBe(false)
  } finally {
    worker.kill()
    await exited
  }
  expect(await page(repo)).toMatchObject({
    ok: true,
    value: { sessions: [{ variants: [{ state: "failed", retryable: true }] }] },
  })
})

function ready(commit: Extract<JobResult, { kind: "ready" }>["commit"]): JobResult {
  return {
    kind: "ready",
    commit,
    title: "Ready",
    summary: "Done.",
    files: [RepoPath.parse("card.tsx")],
    stat: { add: 1, del: 1 },
    ms: { agent: 0, checks: 0, total: 0 },
  }
}

it("reports a runner that exits before claiming instead of launching it on every poll", async () => {
  const { repo, id, queue } = await fixture()
  const attempt = await queue()
  const preload = join(repo.root, ".test-bin", "fail-bootstrap.cjs")
  writeFileSync(
    preload,
    'if (process.argv[1]?.endsWith("runner.js")) throw new Error("bootstrap failed")\n',
  )
  const before = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = `${before ?? ""} --require=${preload}`
  try {
    await page(repo)
    expect((await readCheckpoint(repo)).value.rounds[id]).toMatchObject({
      jobs: { v1: { attempt, state: { kind: "starting" } } },
    })
    await vi.waitFor(
      async () => {
        expect(await page(repo)).toMatchObject({
          ok: true,
          value: {
            sessions: [{ variants: [{ state: "failed", reason: "interrupted", retryable: true }] }],
          },
        })
      },
      { timeout: 5000 },
    )
    await page(repo)
    expect((await readCheckpoint(repo)).value.rounds[id]).toMatchObject({
      jobs: { v1: { attempt, state: { kind: "failed" } } },
    })
  } finally {
    if (before === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = before
  }
})

it("imports a completed legacy result without creating a replacement worker", async () => {
  const { repo, id, request } = await fixture("agent", false)
  const dir = join(homeOf(repo), "sessions", id)
  const base = await snapshot(repo)
  await writeJson(join(dir, "session.json"), {
    id,
    ask: request,
    base,
    opened: 1,
    directions: [{ title: "One", description: "Does it." }],
    parent: null,
  })
  await writeJson(join(dir, "jobs", "v1", "result.json"), ready(base))
  expect(await page(repo)).toMatchObject({
    ok: true,
    value: { sessions: [{ variants: [{ state: "ready", title: "Ready" }] }] },
  })
  expect((await readCheckpoint(repo)).value.rounds[id]).toMatchObject({
    jobs: { v1: { state: ready(base) } },
  })
})

it("publishes owned work while unrelated live-tree recovery is blocked", async () => {
  const { repo, id, queue } = await fixture()
  const attempt = await queue()
  const dir = join(repo.root, "locked")
  mkdirSync(dir)
  writeFileSync(join(dir, "other.txt"), "before\n")
  const blob = (input: string) =>
    BlobId.parse(
      execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repo.root,
        input,
        encoding: "utf8",
      }).trim(),
    )
  const moving = [
    { path: RepoPath.parse("locked/other.txt"), expect: blob("before\n"), write: blob("after\n") },
  ]
  await withCheckpoint(repo, async (store) => {
    await store.save({ ...store.value, journal: { ...store.value.journal, moving } })
  })
  chmodSync(dir, 0o555)
  try {
    const owner = await claimJob(repo, id, "v1", attempt, process.pid)
    if (owner === null) throw new Error("Claim refused")
    expect(await advanceJob(repo, owner, "capture")).toBe(true)
    expect(await finishJob(repo, owner, ready(owner.session.base))).toBe(true)
    const { value } = await readCheckpoint(repo)
    expect(value.journal.moving).toEqual(moving)
    expect(value.rounds[id]).toMatchObject({ jobs: { v1: { state: { kind: "ready" } } } })
    expect(readFileSync(join(dir, "other.txt"), "utf8")).toBe("before\n")
  } finally {
    chmodSync(dir, 0o755)
  }
  await page(repo)
  expect(readFileSync(join(dir, "other.txt"), "utf8")).toBe("after\n")
})
