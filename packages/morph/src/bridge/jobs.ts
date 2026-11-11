// oxlint-disable-next-line import/no-nodejs-modules -- assigns execution ownership.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- resolves attempt logs.
import { join } from "node:path"

import { type MorphConfig } from "../core/config"
import {
  type Direction,
  type JobResult,
  type Phase,
  type Session,
  type SessionId,
  type VariantId,
  variantsOf,
} from "../variant/model"
import { type Checkpoint, readCheckpoint, withCheckpoint } from "./checkpoint"
import { homeOf, type Repo, updateRef, variantRef } from "./git"
import { AttemptId, type Job } from "./job"
import { type LiveTree } from "./live"
import { alive } from "./lock"
import { launchWorker } from "./worker"

/** Allocates an execution recipe before any worker can start. */
export function queuedJob(config: MorphConfig): Job {
  return { attempt: AttemptId.parse(randomUUID()), state: { kind: "queued", config } }
}

/** The immutable inputs and authority returned only to a worker that claimed its attempt. */
export interface JobOwner {
  readonly session: Session
  readonly variant: VariantId
  readonly attempt: AttemptId
  readonly pid: number
  readonly direction: Direction
  readonly config: MorphConfig
}

function owned(job: Job | undefined, owner: JobOwner): boolean {
  return (
    job?.attempt === owner.attempt && job.state.kind === "running" && job.state.pid === owner.pid
  )
}

/** Claims queued work once. A duplicate or superseded process receives no execution input. */
export function claimJob(
  repo: Repo,
  id: SessionId,
  variant: VariantId,
  attempt: AttemptId,
  pid: number,
): Promise<JobOwner | null> {
  return withCheckpoint(repo, async (tree) => {
    const round = tree.value.rounds[id]
    if (round?.kind !== "active") return null
    const job = round.jobs[variant]
    const direction = variantsOf(round.session).find((entry) => entry.id === variant)?.direction
    if (
      job?.attempt !== attempt ||
      (job.state.kind !== "queued" && (job.state.kind !== "starting" || job.state.pid !== pid)) ||
      direction === undefined
    )
      return null
    await tree.save({
      ...tree.value,
      rounds: {
        ...tree.value.rounds,
        [id]: {
          ...round,
          jobs: {
            ...round.jobs,
            [variant]: { attempt, state: { kind: "running", pid, phase: "queued" } },
          },
        },
      },
    })
    return { session: round.session, variant, attempt, pid, direction, config: job.state.config }
  })
}

/** Reports whether this exact worker still owns publication, without recovering the live tree. */
export async function ownsJob(repo: Repo, owner: JobOwner): Promise<boolean> {
  const round = (await readCheckpoint(repo)).value.rounds[owner.session.id]
  return round?.kind === "active" && owned(round.jobs[owner.variant], owner)
}

/** Publishes progress only for the current running owner. */
export function advanceJob(repo: Repo, owner: JobOwner, phase: Phase): Promise<boolean> {
  return withCheckpoint(repo, async (tree) => {
    const round = tree.value.rounds[owner.session.id]
    if (round?.kind !== "active" || !owned(round.jobs[owner.variant], owner)) return false
    await tree.save({
      ...tree.value,
      rounds: {
        ...tree.value.rounds,
        [owner.session.id]: {
          ...round,
          jobs: {
            ...round.jobs,
            [owner.variant]: {
              attempt: owner.attempt,
              state: { kind: "running", pid: owner.pid, phase },
            },
          },
        },
      },
    })
    return true
  })
}

/** Fences both Git ref creation and completion against retry and round closure. */
export function finishJob(repo: Repo, owner: JobOwner, result: JobResult): Promise<boolean> {
  return withCheckpoint(repo, async (tree) => {
    const round = tree.value.rounds[owner.session.id]
    if (round?.kind !== "active" || !owned(round.jobs[owner.variant], owner)) return false
    if (result.kind === "ready")
      await updateRef(repo, variantRef(owner.session.id, owner.variant), result.commit)
    await tree.save({
      ...tree.value,
      rounds: {
        ...tree.value.rounds,
        [owner.session.id]: {
          ...round,
          jobs: {
            ...round.jobs,
            [owner.variant]: { attempt: owner.attempt, state: result },
          },
        },
      },
    })
    return true
  })
}

/** Reclassifies vanished startup or running owners without reading separate process/result files. */
export function recoverJobs(rounds: Checkpoint["rounds"]): Checkpoint["rounds"] {
  let recovered = rounds
  for (const round of Object.values(rounds)) {
    if (round.kind !== "active") continue
    const jobs = { ...round.jobs }
    let changed = false
    for (const { id } of variantsOf(round.session)) {
      const job = jobs[id]
      if (
        job === undefined ||
        (job.state.kind !== "running" && job.state.kind !== "starting") ||
        alive(job.state.pid)
      )
        continue
      jobs[id] = {
        attempt: job.attempt,
        state: { kind: "failed", reason: "interrupted", retryable: true },
      }
      changed = true
    }
    if (changed) recovered = { ...recovered, [round.session.id]: { ...round, jobs } }
  }
  return recovered
}

/** Observes owned execution outcomes without placing variants or recovering unrelated file writes. */
export function readJobs(repo: Repo, id: SessionId) {
  return withCheckpoint(repo, async (store) => {
    const rounds = recoverJobs(store.value.rounds)
    if (rounds !== store.value.rounds) await store.save({ ...store.value, rounds })
    const round = rounds[id]
    return round?.kind === "active" ? round.jobs : null
  })
}

/** Starts queued attempts while the checkout lock prevents closure from racing log creation. */
export async function launchJobs(
  repo: Repo,
  tree: Pick<LiveTree, "rounds" | "publish">,
): Promise<void> {
  for (const round of Object.values(tree.rounds)) {
    if (round.kind !== "active") continue
    let jobs = round.jobs
    for (const { id: variant } of variantsOf(round.session)) {
      const job = jobs[variant]
      if (job?.state.kind !== "queued") continue
      const path = join(
        homeOf(repo),
        "sessions",
        round.session.id,
        "jobs",
        variant,
        `${job.attempt}.log`,
      )
      const launched = await launchWorker(
        "runner",
        [repo.root, round.session.id, variant, job.attempt],
        path,
      )
      jobs = {
        ...jobs,
        [variant]: {
          attempt: job.attempt,
          state: launched.ok
            ? { kind: "starting", pid: launched.pid, config: job.state.config }
            : {
                kind: "failed",
                reason: `runner did not start: ${launched.reason}`,
                retryable: true,
              },
        },
      }
      await tree.publish({ ...tree.rounds, [round.session.id]: { ...round, jobs } })
    }
  }
}
