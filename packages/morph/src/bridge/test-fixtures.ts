import { execFileSync } from "node:child_process"
import { join } from "node:path"

import { vi } from "vitest"

import {
  type Ask,
  type JobResult,
  type Session,
  SessionId,
  type VariantId,
  variantsOf,
} from "../variant/model"
import { claimJob, finishJob, queuedJob } from "./jobs"
import { withLive } from "./live"
import { readCheckpoint } from "./checkpoint"
import { readPlan } from "./planner"
import { discard } from "./session"

import { ThemeName, MorphConfig } from "../core/config"
import { readDesignSystem } from "./design-system"
import acme from "./fixtures/acme/morph.config"
import { type Host, type Repo, openRepo } from "./git"

/** A small synthetic monorepo: an `@acme/ui` design system under `packages/ui`, used by `apps/site`. */
export const REPO = join(import.meta.dirname, "fixtures/acme")

/** This package's own install, which provides the formatter the fixture's config runs. */
export const MODULES = join(import.meta.dirname, "../../node_modules")

/**
 * The budget of a test that drives git, oxfmt or tsx. Each spawns dozens of processes, whose wall
 * time grows with whatever else the machine runs: a test that takes under a second alone passes
 * 5 s on a machine busy with dev servers.
 */
export const SPAWNING_TEST_MS = 30_000

export const CONFIG = MorphConfig.parse(acme)
export const LIGHT = ThemeName.parse("light")
export const DARK = ThemeName.parse("dark")

export const repoCatalog = () => readDesignSystem(REPO, CONFIG)

/** The checkout at `root`, served with the fixture's config. */
export const openHost = async (root: string): Promise<Host> => ({
  ...(await openRepo(root)),
  config: CONFIG,
})

/** A planned round whose workers are terminal, for placement tests that control their results. */
export async function seedSession(repo: Host, request: Ask): Promise<SessionId> {
  await withLive(repo, async (tree) => {
    const session: Session = {
      id: request.id,
      ask: request,
      ...(await tree.base()),
      parent: null,
      directions: Array.from({ length: request.count }, (_, index) => ({
        title: `Direction ${index + 1}`,
        description: "Does it.",
      })),
    }
    const jobs = Object.fromEntries(
      variantsOf(session).map(({ id }) => [
        id,
        {
          ...queuedJob(repo.config),
          state: { kind: "failed", reason: "fixture", retryable: true } as const,
        },
      ]),
    )
    await tree.publish({ ...tree.rounds, [request.id]: { kind: "active", session, jobs } })
  })
  return request.id
}

/** Publishes a controlled result through the same owned attempt boundary as a detached worker. */
export async function completeVariant(
  repo: Host,
  id: SessionId,
  variant: VariantId,
  result: JobResult,
): Promise<void> {
  const job = queuedJob(repo.config)
  await withLive(repo, async (tree) => {
    const round = tree.rounds[id]
    if (round?.kind !== "active") throw new Error("Fixture session is not active")
    await tree.publish({
      ...tree.rounds,
      [id]: { ...round, jobs: { ...round.jobs, [variant]: job } },
    })
  })
  const owner = await claimJob(repo, id, variant, job.attempt, process.pid)
  if (owner === null || !(await finishJob(repo, owner, result)))
    throw new Error("Fixture lost ownership")
}

/** Closes fixture work and waits for detached runners before deleting their scripted agent. */
export async function closeFixtureWorkers(repo: Repo): Promise<void> {
  const { value } = await readCheckpoint(repo)
  for (const [id, round] of Object.entries(value.rounds))
    if (round.kind !== "closed") await discard(repo, SessionId.parse(id))
  await vi.waitFor(
    () => {
      const processes = execFileSync("ps", ["-axo", "args="], { encoding: "utf8" })
      if (processes.includes(`runner.js ${repo.root} `))
        throw new Error("Fixture workers are still running")
    },
    { timeout: 5000 },
  )
}

/** Waits for real detached planning without placing the generated variants. */
export async function waitForSession(repo: Repo, id: SessionId): Promise<Session> {
  return vi.waitFor(
    async () => {
      const round = await readPlan(repo, id)
      if (round?.kind !== "active") throw new Error(`Planning not active: ${JSON.stringify(round)}`)
      return round.session
    },
    { timeout: 10000 },
  )
}
