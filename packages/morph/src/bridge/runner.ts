import { type MorphConfig } from "../core/config"
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
import { changedFiles, commitTree, git, type Host, openRepo, type Repo } from "./git"
import { Outcome, retryPrompt, variantPrompt } from "./prompt"
import { AttemptId } from "./job"
import { advanceJob, claimJob, finishJob, ownsJob } from "./jobs"
import { acquire, release } from "./slots"

const AGENT_DEADLINE_MS = 240_000

const stopped = new AbortController()
process.once("SIGTERM", () => {
  stopped.abort("discarded")
})

function revoke(): void {
  stopped.abort("execution ownership revoked")
}

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

async function edit(
  dir: string,
  config: MorphConfig,
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
  let checked = await timed("checks", checks(dir, await touched(dir), config, stopped.signal))
  if (!checked.ok) {
    console.log(`checks failed, retrying:\n${checked.errors}`)
    await phase("retry")
    const fixed = await agent(retryPrompt(prompt, checked.errors))
    if (!fixed.ok) return { ok: false, result: failed(fixed.detail, true) }
    checked = await timed("checks", checks(dir, await touched(dir), config, stopped.signal))
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
  const slot = await acquire(repo, session.base, repo.config.appRoot, stopped.signal)
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
    const commit = await commitTree(slot.dir, session.base, `morph ${variant}: ${title}`)
    const files = await changedFiles(repo, session.base, commit)
    if (files.length === 0) return failed("the variant equals its base after checks", true)

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

const [root = "", id = "", variantArg = "", attemptArg = ""] = process.argv.slice(2)
const repo = await openRepo(root)
const owner = await claimJob(
  repo,
  SessionId.parse(id),
  VariantId.parse(variantArg),
  AttemptId.parse(attemptArg),
  process.pid,
)
if (owner !== null) {
  const monitor = setInterval(() => {
    void ownsJob(repo, owner).then((owned) => {
      if (!owned) revoke()
    }, revoke)
  }, 250)
  try {
    const result = await generate(
      { ...repo, config: owner.config },
      owner.session,
      owner.variant,
      owner.direction,
      async (phase) => {
        stopped.signal.throwIfAborted()
        if (!(await advanceJob(repo, owner, phase))) revoke()
        stopped.signal.throwIfAborted()
      },
    ).catch((error: unknown) =>
      failed(error instanceof Error ? (error.stack ?? error.message) : String(error), true),
    )
    clearInterval(monitor)
    const outcome = stopped.signal.aborted
      ? failed(`stopped: ${String(stopped.signal.reason)}`, true)
      : result
    if (await finishJob(repo, owner, JobResult.parse(outcome))) console.log(JSON.stringify(outcome))
  } finally {
    clearInterval(monitor)
  }
}
