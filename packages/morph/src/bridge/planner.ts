// oxlint-disable-next-line import/no-nodejs-modules -- assigns execution ownership.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- planner logs live with their round.
import { join } from "node:path"

import { type Direction, type Session, type SessionId, variantsOf } from "../variant/model"
import { type Checkpoint, readCheckpoint, withCheckpoint } from "./checkpoint"
import { homeOf, type Repo } from "./git"
import { AttemptId } from "./job"
import { launchJobs, queuedJob } from "./jobs"
import { type LiveTree } from "./live"
import { alive } from "./lock"
import { type Plan, type PlanInput } from "./plan"
import { launchWorker } from "./worker"

/** A fresh execution attempt over complete, persisted planner inputs. */
export const queuedPlan = (input: PlanInput): Plan => ({
  input,
  attempt: AttemptId.parse(randomUUID()),
  state: { kind: "queued" },
})

/** Inputs and publication authority held by the single successful claimant. */
export interface PlanOwner {
  readonly input: PlanInput
  readonly attempt: AttemptId
  readonly pid: number
}

const owned = (plan: Plan, owner: PlanOwner) =>
  plan.attempt === owner.attempt && plan.state.kind === "running" && plan.state.pid === owner.pid

/** Claims queued work or the startup assigned to this process exactly once. */
export function claimPlan(
  repo: Repo,
  id: SessionId,
  attempt: AttemptId,
  pid: number,
): Promise<PlanOwner | null> {
  return withCheckpoint(repo, async (store) => {
    const round = store.value.rounds[id]
    if (round?.kind !== "planning") return null
    const { plan } = round
    if (
      plan.attempt !== attempt ||
      (plan.state.kind !== "queued" && (plan.state.kind !== "starting" || plan.state.pid !== pid))
    )
      return null
    await store.save({
      ...store.value,
      rounds: {
        ...store.value.rounds,
        [id]: { kind: "planning", plan: { ...plan, state: { kind: "running", pid } } },
      },
    })
    return { input: plan.input, attempt, pid }
  })
}

/** Reads authority without applying unrelated working-tree recovery. */
export async function ownsPlan(repo: Repo, owner: PlanOwner): Promise<boolean> {
  const round = (await readCheckpoint(repo)).value.rounds[owner.input.ask.id]
  return round?.kind === "planning" && owned(round.plan, owner)
}

/** Publishes the generated plan and all variant jobs together, or retains a retryable failure. */
export function finishPlan(
  repo: Repo,
  owner: PlanOwner,
  result: { ok: true; directions: readonly Direction[] } | { ok: false; reason: string },
): Promise<boolean> {
  return withCheckpoint(repo, async (store) => {
    const { ask, parent, base, opened, recipe } = owner.input
    const round = store.value.rounds[ask.id]
    if (round?.kind !== "planning" || !owned(round.plan, owner)) return false
    if (!result.ok) {
      await store.save({
        ...store.value,
        rounds: {
          ...store.value.rounds,
          [ask.id]: {
            kind: "planning",
            plan: { ...round.plan, state: { kind: "failed", reason: result.reason } },
          },
        },
      })
      return true
    }
    const session: Session = {
      id: ask.id,
      ask,
      parent,
      base,
      opened,
      directions: result.directions,
    }
    await store.save({
      ...store.value,
      rounds: {
        ...store.value.rounds,
        [ask.id]: {
          kind: "active",
          session,
          jobs: Object.fromEntries(
            variantsOf(session).map(({ id }) => [id, queuedJob(recipe.config)]),
          ),
        },
      },
    })
    return true
  })
}

/** Converts vanished planner owners into explicit failures, never automatic retries. */
export function recoverPlans(rounds: Checkpoint["rounds"]): Checkpoint["rounds"] {
  let recovered = rounds
  for (const [id, round] of Object.entries(rounds)) {
    if (round.kind !== "planning") continue
    const { state } = round.plan
    if ((state.kind === "starting" || state.kind === "running") && !alive(state.pid))
      recovered = {
        ...recovered,
        [id]: {
          kind: "planning",
          plan: {
            ...round.plan,
            state: { kind: "failed", reason: "Planning was interrupted. Try again." },
          },
        },
      }
  }
  return recovered
}

/** Launches only accepted queued attempts while the checkpoint lock fences log creation. */
export async function launchPlans(
  repo: Repo,
  tree: Pick<LiveTree, "rounds" | "publish">,
): Promise<void> {
  for (const round of Object.values(tree.rounds)) {
    if (round.kind !== "planning" || round.plan.state.kind !== "queued") continue
    const { plan } = round
    const id = plan.input.ask.id
    const launched = await launchWorker(
      "planner-runner",
      [repo.root, id, plan.attempt],
      join(homeOf(repo), "sessions", id, `${plan.attempt}.log`),
    )
    await tree.publish({
      ...tree.rounds,
      [id]: {
        kind: "planning",
        plan: {
          ...plan,
          state: launched.ok
            ? { kind: "starting", pid: launched.pid }
            : { kind: "failed", reason: `Planner did not start: ${launched.reason}` },
        },
      },
    })
  }
}

/** Resumes accepted executions and reads a round without placing code on the live tree. */
export function readPlan(repo: Repo, id: SessionId) {
  return withCheckpoint(repo, async (store) => {
    const rounds = recoverPlans(store.value.rounds)
    if (rounds !== store.value.rounds) await store.save({ ...store.value, rounds })
    const tree = {
      get rounds() {
        return store.value.rounds
      },
      publish: async (rounds: Checkpoint["rounds"]) => store.save({ ...store.value, rounds }),
    }
    await launchPlans(repo, tree)
    await launchJobs(repo, tree)
    return store.value.rounds[id] ?? null
  })
}
