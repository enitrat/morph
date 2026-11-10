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
  type Journal,
  type PageView,
  Parent,
  Phase,
  type Place,
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
import { type Offer, type Placed, type Request } from "../variant/swap"
import { plannerModel, runClaude } from "./agent"
import { readJson, writeJson } from "./disk"
import { absent, git, gitStore, homeOf, type Host, REFS, type Repo, updateRef } from "./git"
import { baseOf, type Converged, converge } from "./live"
import { alive, dropLock, withLock } from "./lock"
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
  dirname(createRequire(join(process.cwd(), "host.js")).resolve("@enitrat/morph/package.json"))

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
    if (child.pid === undefined) throw new Error(`morph: the ${variant} runner did not start`)
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

/** The open sessions, oldest ask first. */
export async function openSessionFiles(repo: Repo): Promise<Session[]> {
  const sessions = await Promise.all(
    (await openSessions(repo)).map((id) => readSessionFile(repo, id)),
  )
  return sessions.filter((session) => session !== null).toSorted((a, b) => a.opened - b.opened)
}

/** Every open session with its ready variants, as the planner reads them under the live lock. */
async function offers(repo: Repo): Promise<Offer[]> {
  return Promise.all(
    (await openSessionFiles(repo)).map(async (session) => {
      const ready = await Promise.all(
        variantsOf(session).map(({ id }) => targetOf(repo, session, id)),
      )
      return {
        session: session.id,
        opened: session.opened,
        ready: ready.filter((target) => target !== null),
      }
    }),
  )
}

const settle = (repo: Repo, request: Request) => converge(repo, () => offers(repo), request)

/**
 * One session as the overlay renders it. `edited` and `drift` come from the disk: `drift` lists
 * the files its variants touch whose code, with every shown variant taken out, is no longer what
 * the session was asked on.
 */
async function sessionView(
  repo: Repo,
  journal: Journal,
  session: Session,
  placed: Placed,
): Promise<SessionView> {
  const store = gitStore(repo)
  const jobs = await Promise.all(
    variantsOf(session).map(async ({ id, direction }) => ({
      id,
      direction,
      job: await readJob(repo, session.id, id),
    })),
  )
  const leased = Object.entries(journal.leases).filter(([, lease]) => lease.session === session.id)
  const edits = await Promise.all(
    leased.map(async ([path, lease]) => (await store.live(RepoPath.parse(path))) !== lease.after),
  )
  const touched = new Set(jobs.flatMap(({ job }) => (job.kind === "ready" ? job.files : [])))
  const drift: RepoPath[] = []
  for (const path of [...touched].toSorted()) {
    const lease = journal.leases[path]
    const origin = lease === undefined ? await store.live(path) : lease.before
    if (origin !== (await store.at(session.base, path))) drift.push(path)
  }
  const place: Place =
    placed.kind === "shown" ? { ...placed, edited: edits.includes(true) } : placed
  return {
    id: session.id,
    place,
    variants: jobs.map(({ id, direction, job }) => viewOf(direction, id, job)),
    trail: trailOf(session.ask.words, session.parent),
    drift,
  }
}

export type Done<T> = { ok: true; value: T } | ({ ok: false } & Refusal)

const refuse = (refusal: Refusal): Done<never> => ({ ok: false, ...refusal })

async function answer(repo: Repo, converged: Converged): Promise<Done<PageView>> {
  if (!converged.ok) return refuse(converged.refusal)
  const { journal, places } = converged
  const sessions = await openSessionFiles(repo)
  const views = await Promise.all(
    sessions.flatMap((session) => {
      const placed = places.get(session.id)
      return placed === undefined ? [] : [sessionView(repo, journal, session, placed)]
    }),
  )
  return { ok: true, value: { sessions: views, stuck: journal.stuck } }
}

/**
 * Every open session and where it stands, after finishing a crashed move and letting waiting
 * sessions take the files that came free. Every session operation answers the same view.
 */
export async function page(repo: Repo): Promise<Done<PageView>> {
  return answer(repo, await settle(repo, { kind: "settle" }))
}

/** The planner run of each session being asked, which a discard stops. */
const planning = new Map<SessionId, AbortController>()

/** Held while one session starts, reruns or ends; other sessions go on meanwhile. */
const sessionLock = (repo: Repo, id: SessionId) => join(homeOf(repo), "locks", `session-${id}`)

/** Runs `body` under the session's lock, with a signal a discard of `id` aborts. */
async function asking<T>(
  repo: Repo,
  id: SessionId,
  signal: AbortSignal,
  body: (stop: AbortSignal) => Promise<T>,
): Promise<T> {
  const discarded = new AbortController()
  planning.set(id, discarded)
  try {
    return await withLock(sessionLock(repo, id), () =>
      body(AbortSignal.any([signal, discarded.signal])),
    )
  } finally {
    planning.delete(id)
  }
}

/**
 * Plans `request` on the page without the variants other sessions show, and starts its jobs, or
 * answers the session it already started. Called under the session's lock.
 */
async function start(
  repo: Host,
  request: Ask,
  parent: Parent | null,
  stop: AbortSignal,
): Promise<Done<PageView>> {
  let session = await readSessionFile(repo, request.id)
  if (session === null) {
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
  return page(repo)
}

/** Starts the session `request.id`, or answers the one it already started. */
export function ask(repo: Host, request: Ask, signal: AbortSignal): Promise<Done<PageView>> {
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
): Promise<Done<PageView>> {
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

/**
 * Shows `choice`: one of the session's ready variants, or the code as it was before it. It takes
 * the files from any session showing them; that session waits and comes back when they free.
 */
export async function show(repo: Repo, id: SessionId, choice: Choice): Promise<Done<PageView>> {
  const session = await readSessionFile(repo, id)
  if (session === null) return refuse({ kind: "not-found" })
  if (choice !== "original") {
    if (!variantsOf(session).some((entry) => entry.id === choice))
      return refuse({ kind: "not-found" })
    if ((await targetOf(repo, session, choice)) === null)
      return refuse({ kind: "not-ready", variant: choice })
  }
  return answer(repo, await settle(repo, { kind: "show", session: id, choice }))
}

/** Runs a failed variant again from its direction; any other variant is left as it is. */
export function retry(repo: Host, id: SessionId, variant: VariantId): Promise<Done<PageView>> {
  return withLock(sessionLock(repo, id), async () => {
    const session = await readSessionFile(repo, id)
    if (session === null || !variantsOf(session).some((entry) => entry.id === variant))
      return refuse({ kind: "not-found" })
    if ((await readJob(repo, id, variant)).kind === "failed") {
      await rm(jobDir(repo, id, variant), { recursive: true, force: true })
      await startJobs(repo, session)
    }
    return page(repo)
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

/**
 * Leaves `variant` on the page as code and ends the session; a session waiting to show it takes
 * its files first. Every session whose variants touch those files merges onto the kept code when
 * it next shows, and lists them in its `drift`. A session already gone is a no-op.
 */
export async function keep(
  repo: Repo,
  id: SessionId,
  variant: VariantId,
): Promise<Done<PageView>> {
  const done = await withLock(sessionLock(repo, id), async () => {
    if ((await readSessionFile(repo, id)) === null) return page(repo)
    const kept = await settle(repo, { kind: "keep", session: id, variant })
    if (!kept.ok) return refuse(kept.refusal)
    await stopJobs(repo, id)
    await drop(repo, id)
    return page(repo)
  })
  if (done.ok) await dropLock(sessionLock(repo, id))
  return done
}

/**
 * Restores every file the session shows, byte for byte, and ends it. A session waiting on those
 * files shows in the same move.
 */
export async function discard(repo: Repo, id: SessionId): Promise<Done<PageView>> {
  // A session still being planned ends there: its ask answers once the planner stops.
  planning.get(id)?.abort("discarded")
  const done = await withLock(sessionLock(repo, id), async () => {
    const moved = await settle(repo, { kind: "discard", session: id })
    if (!moved.ok) return refuse(moved.refusal)
    await stopJobs(repo, id)
    await drop(repo, id)
    return page(repo)
  })
  if (done.ok) await dropLock(sessionLock(repo, id))
  return done
}
