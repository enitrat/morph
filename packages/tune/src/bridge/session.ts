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
  Parent,
  Phase,
  type Refine,
  type Refusal,
  RepoPath,
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
import { absent, git, homeOf, type Host, liveContent, REFS, type Repo, updateRef } from "./git"
import { baseOf, converge, readJournal } from "./live"
import { type Offer, type Request } from "../variant/swap"
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

async function targetOf(repo: Repo, session: Session, variant: VariantId): Promise<Target | null> {
  const job = await readJob(repo, session.id, variant)
  if (job.kind !== "ready") return null
  return { session: session.id, variant, base: session.base, commit: job.commit, files: job.files }
}

/** Every open session with its ready variants, as the planner reads them under the live lock. */
async function offers(repo: Repo): Promise<Offer[]> {
  const sessions = await Promise.all(
    (await openSessions(repo)).map((id) => readSessionFile(repo, id)),
  )
  return Promise.all(
    sessions.flatMap((session) =>
      session === null
        ? []
        : [
            (async () => {
              const ready = await Promise.all(
                variantsOf(session).map(({ id }) => targetOf(repo, session, id)),
              )
              return {
                session: session.id,
                opened: session.opened,
                ready: ready.filter((target) => target !== null),
              }
            })(),
          ],
    ),
  )
}

const settleAll = (repo: Repo, request: Request) => converge(repo, () => offers(repo), request)

export async function readSession(repo: Repo, id: SessionId): Promise<SessionView | null> {
  const session = await readSessionFile(repo, id)
  if (session === null) return null
  const journal = await readJournal(repo)
  const leased = Object.entries(journal.leases).filter(([, lease]) => lease.session === id)
  const edits = await Promise.all(
    leased.map(
      async ([path, lease]) => (await liveContent(repo, RepoPath.parse(path))) !== lease.after,
    ),
  )
  const variants = await Promise.all(
    variantsOf(session).map(async ({ id: variant, direction }) =>
      viewOf(direction, variant, await readJob(repo, id, variant)),
    ),
  )
  const variant = leased[0]?.[1].variant
  return {
    id,
    live: variant === undefined ? null : { variant, edited: edits.includes(true) },
    variants,
    trail: trailOf(session.ask.words, session.parent),
    stuck: journal.stuck.length > 0 ? journal.stuck : null,
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
    const { base, opened } = await baseOf(repo)
    const planned = await runClaude(
      plannerPrompt(request, parent),
      Directions(request.count),
      stop,
      { model: plannerModel(), deadlineMs: PLANNER_DEADLINE_MS },
    )
    if (!planned.ok) return refuse({ kind: "planner-failed", detail: planned.detail })
    await updateRef(repo, variantRef(request.id, "base"), base)
    const { directions } = planned.value
    session = { id: request.id, base, opened, ask: request, directions, parent }
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
      const closed = await keep(repo, from, variant)
      if (!closed.ok) return closed
    }
    if (parent === null) return refuse({ kind: "not-found" })
    return start(repo, request, parent, stop)
  })
}

/** The session, after the page settles: a session that never chose shows its first ready variant. */
export async function look(repo: Repo, id: SessionId): Promise<Done<SessionView>> {
  const settled = await settleAll(repo, { kind: "settle" })
  if (!settled.ok) return refuse(settled.refusal)
  return viewed(repo, id)
}

/** Shows `choice`: one of the session's ready variants, or the code as it was before it. */
export async function show(repo: Repo, id: SessionId, choice: Choice): Promise<Done<SessionView>> {
  const session = await readSessionFile(repo, id)
  if (session === null) return refuse({ kind: "not-found" })
  if (choice !== "original") {
    if (!variantsOf(session).some((entry) => entry.id === choice))
      return refuse({ kind: "not-found" })
    if ((await targetOf(repo, session, choice)) === null)
      return refuse({ kind: "not-ready", variant: choice })
  }
  const moved = await settleAll(repo, { kind: "show", session: id, choice })
  if (!moved.ok) return refuse(moved.refusal)
  const place = moved.places.get(id)
  if (place?.kind === "conflict") return refuse({ kind: "conflict", files: place.files })
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

/** Leaves `variant` on the page as code and ends the session. */
export async function keep(repo: Repo, id: SessionId, variant?: VariantId): Promise<Done<null>> {
  await stopJobs(repo, id)
  const shown = Object.values((await readJournal(repo)).leases).find(
    (lease) => lease.session === id,
  )
  const kept = variant ?? shown?.variant
  if (kept !== undefined) {
    const moved = await settleAll(repo, { kind: "keep", session: id, variant: kept })
    if (!moved.ok) return refuse(moved.refusal)
  }
  await drop(repo, id)
  return { ok: true, value: null }
}

/** Restores every file the session showed, byte for byte, and ends it. */
export function discard(repo: Repo, id: SessionId): Promise<Done<null>> {
  // A session still being planned ends there: its ask answers once the planner stops.
  planning.get(id)?.abort("discarded")
  return withLock(sessionsLock(repo), async () => {
    await stopJobs(repo, id)
    const moved = await settleAll(repo, { kind: "discard", session: id })
    if (!moved.ok) return refuse(moved.refusal)
    await drop(repo, id)
    return { ok: true, value: null }
  })
}
