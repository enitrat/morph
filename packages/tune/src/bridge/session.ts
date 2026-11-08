// oxlint-disable-next-line import/no-nodejs-modules -- sessions are files and detached processes.
import { spawn } from "node:child_process"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { closeSync, openSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { createRequire } from "node:module"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

import {
  type Ask,
  type Choice,
  type Direction,
  JobResult,
  type AppliedJournal,
  Parent,
  Phase,
  type Refine,
  type Refusal,
  type RepoPath,
  Session,
  SessionId,
  type SessionView,
  type Target,
  trailOf,
  VariantId,
  type VariantView,
} from "../variant/model"
import { plannerModel, runClaude } from "./agent"
import { readJson, writeJson } from "./disk"
import {
  absent,
  git,
  homeOf,
  type Host,
  liveContent,
  REFS,
  type Repo,
  snapshot,
  updateRef,
} from "./git"
import { keep as keepLive, readJournal, setLive } from "./live"
import { alive, withLock } from "./lock"
import { Directions, plannerPrompt } from "./prompt"

const PLANNER_DEADLINE_MS = 60_000

const sessionsDir = (repo: Repo) => join(homeOf(repo), "sessions")
const sessionDir = (repo: Repo, id: SessionId) => join(sessionsDir(repo), id)
const sessionFile = (repo: Repo, id: SessionId) => join(sessionDir(repo, id), "session.json")
export const jobDir = (repo: Repo, id: SessionId, variant: VariantId) =>
  join(sessionDir(repo, id), "jobs", variant)
export const variantRef = (id: SessionId, variant: VariantId | "base") => `${REFS}/${id}/${variant}`

export const readSessionFile = (repo: Repo, id: SessionId) =>
  readJson(sessionFile(repo, id), Session)

export const variantsOf = (session: Session) =>
  session.directions.map((direction, index) => ({
    id: VariantId.parse(`v${index + 1}`),
    direction,
  }))

type JobState =
  | JobResult
  | { kind: "queued" }
  | { kind: "running"; pid: number; phase: Phase | "queued" }

async function readJob(repo: Repo, id: SessionId, variant: VariantId): Promise<JobState> {
  const dir = jobDir(repo, id, variant)
  const result = () => readJson(join(dir, "result.json"), JobResult)
  const done = await result()
  if (done !== null) return done
  const pid = await readFile(join(dir, "pid"), "utf8").catch(absent)
  if (pid === null) return { kind: "queued" }
  if (alive(Number(pid))) {
    const phase = await readFile(join(dir, "phase"), "utf8").catch(absent)
    return {
      kind: "running",
      pid: Number(pid),
      phase: phase === null ? "queued" : Phase.parse(phase),
    }
  }
  // The runner writes its result just before exiting, so a dead pid is read against it again.
  return (await result()) ?? { kind: "failed", reason: "interrupted", retryable: true }
}

/**
 * This package's folder, resolved by name from the host's working directory: the bridge runs
 * bundled by the host, so it is not found next to this file.
 */
export const packageDir = (): string =>
  dirname(createRequire(join(process.cwd(), "host.js")).resolve("@enitrat/tune/package.json"))

/** Starts the runner of `variant`, detached so it outlives the dev server that asked for it. */
function spawnJob(repo: Repo, id: SessionId, variant: VariantId): number {
  const pkg = packageDir()
  const log = openSync(join(jobDir(repo, id, variant), "log"), "a")
  try {
    const child = spawn(
      process.execPath,
      [join(pkg, "dist", "runner.js"), repo.root, id, variant],
      { cwd: pkg, detached: true, stdio: ["ignore", log, log] },
    )
    child.unref()
    if (child.pid === undefined) throw new Error(`tune: the ${variant} runner did not start`)
    return child.pid
  } finally {
    closeSync(log)
  }
}

/** Starts every job that has neither run nor finished; a re-run finds nothing left to start. */
async function startJobs(repo: Host, session: Session): Promise<void> {
  for (const { id } of variantsOf(session)) {
    if ((await readJob(repo, session.id, id)).kind !== "queued") continue
    await mkdir(jobDir(repo, session.id, id), { recursive: true })
    await writeJson(join(jobDir(repo, session.id, id), "config.json"), repo.config)
    await writeFile(
      join(jobDir(repo, session.id, id), "pid"),
      String(spawnJob(repo, session.id, id)),
    )
  }
}

export async function openSessions(repo: Repo): Promise<SessionId[]> {
  const names = (await readdir(sessionsDir(repo)).catch(absent)) ?? []
  const ids = names.flatMap((name) => {
    const id = SessionId.safeParse(name)
    return id.success ? [id.data] : []
  })
  const open = await Promise.all(ids.map(async (id) => (await readSessionFile(repo, id)) !== null))
  return ids.filter((_, index) => open[index])
}

function viewOf(direction: Direction, id: VariantId, job: JobState): VariantView {
  if (job.kind === "queued") return { id, direction, state: "pending", phase: "queued" }
  if (job.kind === "running") return { id, direction, state: "pending", phase: job.phase }
  if (job.kind === "failed")
    return { id, direction, state: "failed", reason: job.reason, retryable: job.retryable }
  const { title, summary, files, stat } = job
  return { id, direction, state: "ready", title, summary, files, stat }
}

const appliedOf = (journal: AppliedJournal) =>
  journal.kind === "moving" ? journal.to : journal.applied

export async function readSession(repo: Repo, id: SessionId): Promise<SessionView | null> {
  const session = await readSessionFile(repo, id)
  if (session === null) return null
  const journal = await readJournal(repo)
  const applied = appliedOf(journal)
  const shown = applied?.session === id ? applied : null
  const edits = await Promise.all(
    (shown?.files ?? []).map(async (file) => (await liveContent(repo, file.path)) !== file.after),
  )
  const variants = await Promise.all(
    variantsOf(session).map(async ({ id: variant, direction }) =>
      viewOf(direction, variant, await readJob(repo, id, variant)),
    ),
  )
  return {
    id,
    live: shown && { variant: shown.variant, edited: edits.includes(true) },
    variants,
    trail: trailOf(session.ask.words, session.parent),
    stuck:
      journal.kind === "stuck" && (shown !== null || applied === null) ? journal.conflicts : null,
  }
}

export type Done<T> = { ok: true; value: T } | ({ ok: false } & Refusal)

const refuse = (refusal: Refusal): Done<never> => ({ ok: false, ...refusal })

async function viewed(repo: Repo, id: SessionId): Promise<Done<SessionView>> {
  const view = await readSession(repo, id)
  return view === null ? refuse({ kind: "not-found" }) : { ok: true, value: view }
}

/** The planner run of each session being asked, which a discard stops. */
const planning = new Map<SessionId, AbortController>()

const sessionsLock = (repo: Repo) => join(homeOf(repo), "sessions.lock")

/** Runs `body` under the sessions lock, with a signal a discard of `id` aborts. */
async function asking<T>(
  repo: Repo,
  id: SessionId,
  signal: AbortSignal,
  body: (stop: AbortSignal) => Promise<T>,
): Promise<T> {
  const discarded = new AbortController()
  planning.set(id, discarded)
  try {
    return await withLock(sessionsLock(repo), () =>
      body(AbortSignal.any([signal, discarded.signal])),
    )
  } finally {
    planning.delete(id)
  }
}

/**
 * Plans `request` on the tree as it is and starts its jobs, or answers the session it already
 * started. Another open session refuses it: the designer keeps or discards that one first, so
 * variants never stack. Called under the sessions lock.
 */
async function start(
  repo: Host,
  request: Ask,
  parent: Parent | null,
  stop: AbortSignal,
): Promise<Done<SessionView>> {
  let session = await readSessionFile(repo, request.id)
  if (session === null) {
    const other = (await openSessions(repo)).find((id) => id !== request.id)
    if (other !== undefined) return refuse({ kind: "busy", session: other })
    const base = await snapshot(repo)
    const planned = await runClaude(
      plannerPrompt(request, parent),
      Directions(request.count),
      stop,
      { model: plannerModel(), deadlineMs: PLANNER_DEADLINE_MS },
    )
    if (!planned.ok) return refuse({ kind: "planner-failed", detail: planned.detail })
    await updateRef(repo, variantRef(request.id, "base"), base)
    session = { id: request.id, base, ask: request, directions: planned.value.directions, parent }
    await writeJson(sessionFile(repo, request.id), session)
  }
  await startJobs(repo, session)
  return viewed(repo, request.id)
}

/** Starts the session `request.id`, or answers the one it already started. */
export function ask(repo: Host, request: Ask, signal: AbortSignal): Promise<Done<SessionView>> {
  return asking(repo, request.id, signal, (stop) => start(repo, request, null, stop))
}

/** What the new round of a refine stands on, written before the kept session is dropped. */
const parentFile = (repo: Repo, id: SessionId) => join(sessionDir(repo, id), "parent.json")

/**
 * Keeps `variant` of the session `from` and asks `ask` on top of it, as one new round. A re-post
 * finds the parent it recorded, so a refine whose planner failed after the keep plans again.
 */
export function refine(
  repo: Host,
  { from, variant, ask: request }: Refine,
  signal: AbortSignal,
): Promise<Done<SessionView>> {
  return asking(repo, request.id, signal, async (stop) => {
    if ((await readSessionFile(repo, request.id)) !== null) return start(repo, request, null, stop)
    let parent = await readJson(parentFile(repo, request.id), Parent)
    const kept = await readSessionFile(repo, from)
    if (kept !== null) {
      const job = await readJob(repo, from, variant)
      if (job.kind !== "ready") return refuse({ kind: "not-ready", variant })
      const target = {
        session: from,
        variant,
        base: kept.base,
        commit: job.commit,
        files: job.files,
      }
      const shown = await setLive(
        repo,
        target,
        (applied) => applied === null || applied.session === from,
      )
      if (!shown.ok) return refuse({ kind: "conflict", files: shown.conflicts })
      if (parent === null) {
        parent = {
          session: from,
          variant,
          title: job.title,
          summary: job.summary,
          words: kept.ask.words,
          parent: kept.parent,
        }
        await writeJson(parentFile(repo, request.id), parent)
      }
      await keep(repo, from)
    }
    if (parent === null) return refuse({ kind: "not-found" })
    return start(repo, request, parent, stop)
  })
}

async function targetOf(repo: Repo, session: Session, variant: VariantId): Promise<Target | null> {
  const job = await readJob(repo, session.id, variant)
  if (job.kind !== "ready") return null
  return { session: session.id, variant, base: session.base, commit: job.commit, files: job.files }
}

/** Present once anything was shown in the session, by the designer or by `look`. */
const chosenFile = (repo: Repo, id: SessionId) => join(sessionDir(repo, id), "chosen")

/**
 * The session, after showing its first ready variant when the session never showed anything, so
 * a designer who flipped back to the original stays on it.
 */
export async function look(repo: Repo, id: SessionId): Promise<Done<SessionView>> {
  const session = await readSessionFile(repo, id)
  if (session === null) return refuse({ kind: "not-found" })
  const chosen = (await readFile(chosenFile(repo, id), "utf8").catch(absent)) !== null
  if (!chosen && appliedOf(await readJournal(repo)) === null) {
    for (const { id: variant } of variantsOf(session)) {
      const target = await targetOf(repo, session, variant)
      if (target === null) continue
      const moved = await setLive(repo, target, (applied) => applied === null)
      if (moved.ok && moved.applied?.session === id) await writeFile(chosenFile(repo, id), variant)
      break
    }
  }
  return viewed(repo, id)
}

/** Shows `choice`: one of the session's ready variants, or the code as it was before it. */
export async function show(repo: Repo, id: SessionId, choice: Choice): Promise<Done<SessionView>> {
  const session = await readSessionFile(repo, id)
  if (session === null) return refuse({ kind: "not-found" })
  let target: Target | null = null
  if (choice !== "original") {
    if (!variantsOf(session).some((entry) => entry.id === choice))
      return refuse({ kind: "not-found" })
    target = await targetOf(repo, session, choice)
    if (target === null) return refuse({ kind: "not-ready", variant: choice })
  }
  await writeFile(chosenFile(repo, id), choice)
  const moved = await setLive(repo, target, (applied) => applied === null || applied.session === id)
  if (!moved.ok) return refuse({ kind: "conflict", files: moved.conflicts })
  return viewed(repo, id)
}

/** Runs a failed variant again from its direction; any other variant is left as it is. */
export function retry(repo: Host, id: SessionId, variant: VariantId): Promise<Done<SessionView>> {
  return withLock(sessionsLock(repo), async () => {
    const session = await readSessionFile(repo, id)
    if (session === null || !variantsOf(session).some((entry) => entry.id === variant))
      return refuse({ kind: "not-found" })
    if ((await readJob(repo, id, variant)).kind === "failed") {
      await rm(jobDir(repo, id, variant), { recursive: true, force: true })
      await startJobs(repo, session)
    }
    return viewed(repo, id)
  })
}

/** Stops the session's running jobs, so none writes anything after this. */
async function stopJobs(repo: Repo, id: SessionId): Promise<void> {
  const session = await readSessionFile(repo, id)
  for (const { id: variant } of session === null ? [] : variantsOf(session)) {
    const job = await readJob(repo, id, variant)
    if (job.kind !== "running") continue
    try {
      process.kill(-job.pid, "SIGTERM")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    }
  }
}

/** Deletes the session's refs and files. A session already gone is a no-op. */
async function drop(repo: Repo, id: SessionId): Promise<void> {
  const refs = (await git(repo.root, ["for-each-ref", "--format=%(refname)", `${REFS}/${id}/`]))
    .toString()
    .split("\n")
    .filter((ref) => ref !== "")
  for (const ref of refs) await git(repo.root, ["update-ref", "-d", ref])
  await rm(sessionDir(repo, id), { recursive: true, force: true })
}

/** Leaves the shown files as they are and ends the session. */
export async function keep(repo: Repo, id: SessionId): Promise<Done<null>> {
  await stopJobs(repo, id)
  await keepLive(repo, id)
  await drop(repo, id)
  return { ok: true, value: null }
}

/** Restores every file the session showed, byte for byte, and ends it. */
export function discard(repo: Repo, id: SessionId): Promise<Done<null>> {
  // A session still being planned ends there: its ask answers once the planner stops.
  planning.get(id)?.abort("discarded")
  return withLock(sessionsLock(repo), async () => {
    await stopJobs(repo, id)
    const moved = await setLive(repo, null, (applied) => applied?.session === id)
    if (!moved.ok) return refuse({ kind: "conflict", files: moved.conflicts })
    await drop(repo, id)
    return { ok: true, value: null }
  })
}
