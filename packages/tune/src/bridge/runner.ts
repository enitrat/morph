// The detached program behind one variant job: `node --import tsx runner.ts <repo> <session> <v>`.
// It edits a slot, checks it, captures it as a ref and writes `result.json` in its job directory.
// oxlint-disable-next-line import/no-nodejs-modules -- a runner is a node process.
import { writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { TuneConfig } from "../core/config"
import {
  type CommitId,
  type Direction,
  JobResult,
  type Phase,
  RepoPath,
  SessionId,
  type Session,
  type Stat,
  VariantId,
} from "../variant/model"
import { type AgentResult, agentModel, EDIT_TOOLS, runClaude } from "./agent"
import { checks } from "./checks"
import { outside } from "./contain"
import { readImportable } from "./design-system"
import { readJson, writeJson } from "./disk"
import { changedFiles, commitTree, git, type Host, openRepo, type Repo, updateRef } from "./git"
import { Outcome, retryPrompt, variantPrompt } from "./prompt"
import { jobDir, readSessionFile, variantRef, variantsOf } from "./session"
import { acquire, release } from "./slots"

const AGENT_DEADLINE_MS = 240_000

/**
 * A discard sends SIGTERM to this runner's process group, which holds its checks. The agent leads
 * a group of its own, so aborting this signal stops it; the runner then exits at once, writing
 * nothing, and its slot lock, held by a dead process, is free.
 */
const stopped = new AbortController()
process.once("SIGTERM", () => {
  stopped.abort("discarded")
  process.exit(143)
})

const failed = (reason: string, retryable: boolean): JobResult => ({
  kind: "failed",
  reason,
  retryable,
})

async function touched(dir: string): Promise<RepoPath[]> {
  const out = await git(dir, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
  ])
  return out
    .toString()
    .split("\0")
    .filter((entry) => entry !== "")
    .map((entry) => RepoPath.parse(entry.slice(3)))
}

async function statOf(repo: Repo, base: CommitId, commit: CommitId): Promise<Stat> {
  const out = (await git(repo.root, ["diff", "--numstat", base, commit])).toString()
  return out
    .split("\n")
    .filter((line) => line !== "")
    .reduce(
      (sum, line) => {
        const [add = "0", del = "0"] = line.split("\t")
        return { add: sum.add + (Number(add) || 0), del: sum.del + (Number(del) || 0) }
      },
      { add: 0, del: 0 },
    )
}

interface Timings {
  agent: number
  checks: number
}

/** The agent edits the slot, then checks run; failing checks get one more agent run. */
async function edit(
  dir: string,
  config: TuneConfig,
  prompt: string,
  phase: (phase: Phase) => Promise<void>,
  ms: Timings,
): Promise<{ ok: true; outcome: Outcome } | { ok: false; result: JobResult }> {
  const timed = async <T>(key: keyof Timings, work: Promise<T>): Promise<T> => {
    const start = performance.now()
    const value = await work
    ms[key] += performance.now() - start
    return value
  }
  const run = { cwd: dir, model: agentModel(), tools: EDIT_TOOLS, deadlineMs: AGENT_DEADLINE_MS }
  const agent = async (text: string): Promise<AgentResult<Outcome>> => {
    const answer = await timed("agent", runClaude(text, Outcome, stopped.signal, run))
    if (!answer.ok) return answer
    const escaped = await outside(dir, answer.writes)
    return escaped.length === 0
      ? answer
      : { ok: false, detail: `the agent wrote outside its slot: ${escaped.join(", ")}` }
  }
  await phase("agent")
  const answer = await agent(prompt)
  if (!answer.ok) return { ok: false, result: failed(answer.detail, true) }
  if ((await touched(dir)).length === 0)
    return { ok: false, result: failed("the agent changed no file", true) }

  await phase("checks")
  let checked = await timed("checks", checks(dir, await touched(dir), config))
  if (!checked.ok) {
    console.log(`checks failed, retrying:\n${checked.errors}`)
    await phase("retry")
    // The retry's own title would name the fix, so the variant keeps the first run's.
    const fixed = await agent(retryPrompt(prompt, checked.errors))
    if (!fixed.ok) return { ok: false, result: failed(fixed.detail, true) }
    checked = await timed("checks", checks(dir, await touched(dir), config))
    if (!checked.ok) {
      console.log(`checks fail after a retry:\n${checked.errors}`)
      return {
        ok: false,
        result: failed(`Checks still fail after a retry\n${checked.reason}`, true),
      }
    }
  }
  return { ok: true, outcome: answer.value }
}

async function generate(
  repo: Host,
  session: Session,
  variant: VariantId,
  direction: Direction,
  phase: (phase: Phase) => Promise<void>,
): Promise<JobResult> {
  const started = performance.now()
  await phase("slot")
  const slot = await acquire(repo, session.base, repo.config.appRoot)
  const ms = { agent: 0, checks: 0 }
  try {
    const prompt = variantPrompt(session.ask, session.parent, direction, {
      imports: readImportable(slot.dir, repo.config),
      styleRules: repo.config.styleRules,
    })
    const edited = await edit(slot.dir, repo.config, prompt, phase, ms)
    if (!edited.ok) return edited.result

    await phase("capture")
    const { title, summary } = edited.outcome
    const commit = await commitTree(slot.dir, session.base, `tune ${variant}: ${title}`)
    const files = await changedFiles(repo, session.base, commit)
    if (files.length === 0) return failed("the variant equals its base after checks", true)
    await updateRef(repo, variantRef(session.id, variant), commit)

    return {
      kind: "ready",
      commit,
      title,
      summary,
      files,
      stat: await statOf(repo, session.base, commit),
      ms: { ...ms, total: performance.now() - started },
    }
  } finally {
    await release(slot)
  }
}

const [root = "", id = "", variantArg = ""] = process.argv.slice(2)
const opened = await openRepo(root)
const session = await readSessionFile(opened, SessionId.parse(id))
if (session === null) throw new Error(`tune: no session ${id}`)
const variant = VariantId.parse(variantArg)
const direction = variantsOf(session).find((entry) => entry.id === variant)?.direction
if (direction === undefined) throw new Error(`tune: session ${id} has no ${variant}`)
const dir = jobDir(opened, session.id, variant)
const config = await readJson(join(dir, "config.json"), TuneConfig)
if (config === null) throw new Error(`tune: ${variant} has no config.json`)

const result = await generate({ ...opened, config }, session, variant, direction, (phase) =>
  writeFile(join(dir, "phase"), phase),
).catch((error: unknown) =>
  failed(error instanceof Error ? (error.stack ?? error.message) : String(error), true),
)
await writeJson(join(dir, "result.json"), JobResult.parse(result))
console.log(JSON.stringify(result))
