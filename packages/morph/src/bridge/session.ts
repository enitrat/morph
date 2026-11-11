// oxlint-disable-next-line import/no-nodejs-modules -- session cleanup removes execution artifacts.
import { rm } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import {
  type Ask,
  type Choice,
  type Direction,
  type Journal,
  type PageView,
  type Parent,
  type Place,
  type Refine,
  type Refusal,
  RepoPath,
  type Session,
  SessionId,
  type ActiveSessionView,
  type SessionView,
  trailOf,
  threadOf,
  type VariantId,
  variantsOf,
  type VariantView,
} from "../variant/model"
import { type Offer, type Placed, type Request } from "../variant/swap"
import { plannerModel } from "./agent"
import { git, gitStore, homeOf, type Host, REFS, type Repo, updateRef, variantRef } from "./git"
import { type LiveTree, withLive } from "./live"
import { type Checkpoint } from "./checkpoint"
import { type Job } from "./job"
import { launchJobs, queuedJob, recoverJobs } from "./jobs"
import { launchPlans, queuedPlan, recoverPlans } from "./planner"

const PLANNER_DEADLINE_MS = 60_000

/** Reads the active plan; preparing and terminal rounds have no runnable session. */
export const readSession = (repo: Repo, id: SessionId) =>
  withLive(repo, async (tree) => {
    const round = tree.rounds[id]
    return round?.kind === "active" ? round.session : null
  })

/** IDs of all nonterminal rounds, including accepted planning and failed attempts. */
export async function openSessions(repo: Repo): Promise<SessionId[]> {
  return withLive(repo, async (tree) =>
    Object.entries(tree.rounds).flatMap(([id, round]) =>
      round.kind === "closed" ? [] : [SessionId.parse(id)],
    ),
  )
}

function viewOf(direction: Direction, id: VariantId, job: Job["state"]): VariantView {
  if (job.kind === "queued" || job.kind === "starting")
    return { id, direction, state: "pending", phase: "queued" }
  if (job.kind === "running") return { id, direction, state: "pending", phase: job.phase }
  if (job.kind === "failed")
    return { id, direction, state: "failed", reason: job.reason, retryable: job.retryable }
  const { title, summary, files, stat } = job
  return { id, direction, state: "ready", title, summary, files, stat }
}

/** Active planned sessions, oldest ask first. Preparing rounds are not included. */
export async function plannedSessions(repo: Repo): Promise<Session[]> {
  return withLive(repo, async (tree) => activeRounds(tree).map((round) => round.session))
}

function activeRounds(tree: LiveTree) {
  return Object.values(tree.rounds)
    .filter((round) => round.kind === "active")
    .toSorted((a, b) => a.session.opened - b.session.opened)
}

interface CapturedSession {
  readonly session: Session
  readonly jobs: readonly {
    readonly id: VariantId
    readonly direction: Direction
    readonly job: Job["state"]
  }[]
}

async function settle(
  repo: Repo,
  tree: LiveTree,
  request: Request,
  rounds?: Checkpoint["rounds"],
): Promise<Done<PageView>> {
  const captured: CapturedSession[] = activeRounds(tree).map(({ session, jobs }) => ({
    session,
    jobs: variantsOf(session).map(({ id, direction }) => {
      const job = jobs[id]
      if (job === undefined) throw new Error(`morph: missing job ${session.id}/${id}`)
      return { id, direction, job: job.state }
    }),
  }))
  const offers: Offer[] = captured.map(({ session, jobs }) => ({
    session: session.id,
    opened: session.opened,
    ready: jobs.flatMap(({ id, job }) =>
      job.kind === "ready"
        ? [
            {
              session: session.id,
              variant: id,
              base: session.base,
              commit: job.commit,
              files: job.files,
            },
          ]
        : [],
    ),
  }))
  const settled = await tree.settle(offers, request, rounds)
  if (!settled.ok) return refuse(settled.refusal)
  const views = await Promise.all(
    captured.flatMap((entry) => {
      if (tree.rounds[entry.session.id]?.kind !== "active") return []
      const placed = settled.places.get(entry.session.id)
      return placed === undefined ? [] : [sessionView(repo, settled.journal, entry, placed)]
    }),
  )
  const opened = (round: Checkpoint["rounds"][SessionId]) =>
    round.kind === "active"
      ? round.session.opened
      : round.kind === "planning"
        ? round.plan.input.opened
        : Infinity
  return {
    ok: true,
    value: await tree.observe({
      sessions: Object.values(tree.rounds)
        .toSorted((a, b) => opened(a) - opened(b))
        .flatMap((round): SessionView[] => {
          if (round.kind === "active") return views.filter((view) => view.id === round.session.id)
          if (round.kind === "preparing")
            return [
              {
                kind: "planning",
                id: round.ask.id,
                thread: threadOf(round.ask.id, round.parent),
                words: round.ask.words,
                targets: round.ask.targets,
                trail: trailOf(round.ask.words, round.parent),
              },
            ]
          if (round.kind !== "planning") return []
          const { input, state } = round.plan
          const common = {
            id: input.ask.id,
            thread: threadOf(input.ask.id, input.parent),
            words: input.ask.words,
            targets: input.ask.targets,
            trail: trailOf(input.ask.words, input.parent),
          }
          return [
            state.kind === "failed"
              ? { ...common, kind: "plan-failed", reason: state.reason }
              : { ...common, kind: "planning" },
          ]
        }),
      stuck: settled.journal.stuck,
    }),
  }
}

/**
 * One session as the overlay renders it. `edited` and `drift` come from the disk: `drift` lists
 * the files its variants touch whose code, with every shown variant taken out, is no longer what
 * the session was asked on.
 */
async function sessionView(
  repo: Repo,
  journal: Journal,
  { session, jobs }: CapturedSession,
  placed: Placed,
): Promise<ActiveSessionView> {
  const store = gitStore(repo)
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
    kind: "active",
    id: session.id,
    thread: threadOf(session.id, session.parent),
    words: session.ask.words,
    targets: session.ask.targets,
    place,
    variants: jobs.map(({ id, direction, job }) => viewOf(direction, id, job)),
    trail: trailOf(session.ask.words, session.parent),
    drift,
  }
}

/** An operation's result or a refusal that the transport can report to the designer. */
export type Done<T> = { ok: true; value: T } | ({ ok: false } & Refusal)

const refuse = (refusal: Refusal): Done<never> => ({ ok: false, ...refusal })

/**
 * Every open round, after finishing a crashed move and letting waiting
 * sessions take the files that came free. Every session operation answers the same view.
 */
export async function page(repo: Repo): Promise<Done<PageView>> {
  return withLive(repo, async (tree) => {
    await finishClosing(repo, tree)
    for (const round of Object.values(tree.rounds)) {
      if (round.kind !== "preparing") continue
      const input = {
        ask: round.ask,
        parent: round.parent,
        recipe: round.recipe,
        ...(await tree.base()),
      }
      await updateRef(repo, variantRef(round.ask.id, "base"), input.base)
      await tree.publish({
        ...tree.rounds,
        [round.ask.id]: { kind: "planning", plan: queuedPlan(input) },
      })
    }
    const recovered = recoverPlans(recoverJobs(tree.rounds))
    if (recovered !== tree.rounds) await tree.publish(recovered)
    await launchPlans(repo, tree)
    await launchJobs(repo, tree)
    return settle(repo, tree, { kind: "settle" })
  })
}

const recipeOf = (repo: Host) => ({
  config: repo.config,
  model: plannerModel(),
  deadlineMs: PLANNER_DEADLINE_MS,
})

/** Accepts an ask durably. Reposts observe the same round, including its failure or closure. */
export async function ask(repo: Host, request: Ask): Promise<Done<PageView>> {
  await withLive(repo, async (tree) => {
    if (tree.rounds[request.id] !== undefined) return
    const input = { ask: request, parent: null, recipe: recipeOf(repo), ...(await tree.base()) }
    await updateRef(repo, variantRef(request.id, "base"), input.base)
    await tree.publish({
      ...tree.rounds,
      [request.id]: { kind: "planning", plan: queuedPlan(input) },
    })
  })
  return page(repo)
}

/** Explicitly retries failed planning with a new attempt over the original saved inputs. */
export async function retryPlan(repo: Repo, id: SessionId): Promise<Done<PageView>> {
  await withLive(repo, async (tree) => {
    const recovered = recoverPlans(tree.rounds)
    if (recovered !== tree.rounds) await tree.publish(recovered)
    const round = tree.rounds[id]
    if (round?.kind === "planning" && round.plan.state.kind === "failed")
      await tree.publish({
        ...tree.rounds,
        [id]: { kind: "planning", plan: queuedPlan(round.plan.input) },
      })
  })
  return page(repo)
}

/** Keeps a round and records its complete successor request in the same file-write intent. */
export async function refine(
  repo: Host,
  { from, variant, ask: request }: Refine,
): Promise<Done<PageView>> {
  const accepted = await withLive(repo, async (tree): Promise<Done<null>> => {
    await finishClosing(repo, tree)
    const next = tree.rounds[request.id]
    if (next !== undefined && next.kind !== "legacy-refinement") return { ok: true, value: null }
    const previous = tree.rounds[from]
    if (next?.kind === "legacy-refinement") {
      if (
        next.parent.session !== from ||
        next.parent.variant !== variant ||
        previous?.kind !== "closed" ||
        previous.outcome.kind === "discarded" ||
        previous.outcome.variant !== variant
      )
        return refuse({
          kind: "invalid",
          detail:
            "This interrupted refinement has no confirmed keep. Review the code and start a new ask.",
        })
      await tree.publish({
        ...tree.rounds,
        [request.id]: {
          kind: "preparing",
          ask: request,
          parent: next.parent,
          recipe: recipeOf(repo),
        },
      })
      return { ok: true, value: null }
    }
    if (previous?.kind !== "active") return refuse({ kind: "not-found" })
    const kept = previous.session
    const job = previous.jobs[variant]?.state
    if (job?.kind !== "ready") return refuse({ kind: "not-ready", variant })
    const parent: Parent = {
      session: from,
      variant,
      title: job.title,
      summary: job.summary,
      words: kept.ask.words,
      parent: kept.parent,
    }
    const closed = await settle(
      repo,
      tree,
      { kind: "keep", session: from, variant },
      {
        ...tree.rounds,
        [from]: {
          kind: "closing",
          outcome: { kind: "refined", variant, next: request.id },
        },
        [request.id]: { kind: "preparing", ask: request, parent, recipe: recipeOf(repo) },
      },
    )
    if (!closed.ok) return closed
    await finishClosing(repo, tree)
    return { ok: true, value: null }
  })
  if (!accepted.ok) return accepted
  return page(repo)
}

/**
 * Shows `choice`: one of the session's ready variants, or the code as it was before it. It takes
 * the files from any session showing them; that session waits and comes back when they free.
 */
export async function show(repo: Repo, id: SessionId, choice: Choice): Promise<Done<PageView>> {
  return withLive(repo, async (tree) => {
    await finishClosing(repo, tree)
    const round = tree.rounds[id]
    if (round?.kind !== "active") return refuse({ kind: "not-found" })
    const session = round.session
    if (choice !== "original") {
      if (!variantsOf(session).some((entry) => entry.id === choice))
        return refuse({ kind: "not-found" })
      if (round.jobs[choice]?.state.kind !== "ready")
        return refuse({ kind: "not-ready", variant: choice })
    }
    return settle(repo, tree, { kind: "show", session: id, choice })
  })
}

/** Replaces the named failed attempt and resumes accepted queued work. */
export function retry(repo: Host, id: SessionId, variant: VariantId): Promise<Done<PageView>> {
  return withLive(repo, async (tree) => {
    await finishClosing(repo, tree)
    const recovered = recoverJobs(tree.rounds)
    if (recovered !== tree.rounds) await tree.publish(recovered)
    const round = tree.rounds[id]
    if (
      round?.kind !== "active" ||
      !variantsOf(round.session).some((entry) => entry.id === variant)
    )
      return refuse({ kind: "not-found" })
    if (round.jobs[variant]?.state.kind === "failed") {
      await tree.publish({
        ...tree.rounds,
        [id]: {
          ...round,
          jobs: {
            ...round.jobs,
            [variant]: queuedJob(repo.config),
          },
        },
      })
      await launchJobs(repo, tree)
    }
    return settle(repo, tree, { kind: "settle" })
  })
}

async function drop(repo: Repo, id: SessionId): Promise<void> {
  const refs = (await git(repo.root, ["for-each-ref", "--format=%(refname)", `${REFS}/${id}/`]))
    .toString()
    .split("\n")
    .filter((ref) => ref !== "")
  for (const ref of refs) await git(repo.root, ["update-ref", "-d", ref])
  await rm(join(homeOf(repo), "sessions", id), { recursive: true, force: true })
}

async function finishClosing(repo: Repo, tree: LiveTree): Promise<void> {
  for (const [key, round] of Object.entries(tree.rounds)) {
    if (round.kind !== "closing") continue
    const id = SessionId.parse(key)
    await drop(repo, id)
    await tree.publish({ ...tree.rounds, [id]: { kind: "closed", outcome: round.outcome } })
  }
}

/** Leaves the kept variant as code and durably closes its round before cleanup. */
export async function keep(repo: Repo, id: SessionId, variant: VariantId): Promise<Done<PageView>> {
  return withLive(repo, async (tree) => {
    await finishClosing(repo, tree)
    const round = tree.rounds[id]
    if (round?.kind !== "active") return settle(repo, tree, { kind: "settle" })
    const kept = await settle(
      repo,
      tree,
      { kind: "keep", session: id, variant },
      {
        ...tree.rounds,
        [id]: { kind: "closing", outcome: { kind: "kept", variant } },
      },
    )
    if (!kept.ok) return kept
    await finishClosing(repo, tree)
    return settle(repo, tree, { kind: "settle" })
  })
}

/** Restores the round's files and records closure in the same recoverable checkpoint. */
export async function discard(repo: Repo, id: SessionId): Promise<Done<PageView>> {
  return withLive(repo, async (tree) => {
    await finishClosing(repo, tree)
    const round = tree.rounds[id]
    const outcome = { kind: "discarded" } as const
    const moved = await settle(
      repo,
      tree,
      { kind: "discard", session: id },
      {
        ...tree.rounds,
        [id]: round?.kind === "closed" ? round : { kind: "closing", outcome },
      },
    )
    if (!moved.ok) return moved
    await finishClosing(repo, tree)
    return settle(repo, tree, { kind: "settle" })
  })
}
