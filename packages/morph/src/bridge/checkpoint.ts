// oxlint-disable-next-line import/no-nodejs-modules -- checkpoint migration reads legacy storage.
import { readdir, readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

// oxlint-disable-next-line import/no-nodejs-modules -- migration assigns ownership ids to imported jobs.
import { randomUUID } from "node:crypto"

import { z } from "zod"

import {
  Ask,
  EMPTY_JOURNAL,
  Journal,
  JobResult,
  Observation,
  Parent,
  Session,
  SessionId,
  VariantId,
  threadOf,
} from "../variant/model"
import { readJson, writeJson } from "./disk"
import { absent, homeOf, type Repo } from "./git"
import { Plan, PlanRecipe } from "./plan"
import { AttemptId, Job } from "./job"
import { alive, withLock } from "./lock"

const Outcome = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kept"), variant: VariantId }),
  z.object({ kind: z.literal("discarded") }),
  z.object({ kind: z.literal("refined"), variant: VariantId, next: SessionId }),
])

const Round = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("preparing"),
    ask: Ask,
    parent: Parent.nullable(),
    recipe: PlanRecipe,
  }),
  z.object({ kind: z.literal("planning"), plan: Plan }),
  z.object({
    kind: z.literal("active"),
    session: Session,
    jobs: z.partialRecord(VariantId, Job).readonly(),
  }),
  z.object({ kind: z.literal("closing"), outcome: Outcome }),
  z.object({ kind: z.literal("closed"), outcome: Outcome }),
  z.object({ kind: z.literal("legacy-refinement"), parent: Parent }),
])
/** One atomic publication of session ownership, working-tree intent, and observation order. */
export const Checkpoint = z
  .object({
    version: z.literal(1),
    journal: Journal,
    observation: Observation,
    rounds: z.record(SessionId, Round).readonly(),
  })
  .refine(
    ({ rounds }) =>
      Object.entries(rounds).every(([id, round]) => {
        if (round.kind === "preparing") return round.ask.id === id
        if (round.kind === "active")
          return (
            round.session.id === id &&
            Object.keys(round.jobs).length === round.session.directions.length &&
            round.session.directions.every(
              (_, index) => round.jobs[VariantId.parse(`v${index + 1}`)] !== undefined,
            )
          )
        if (round.kind === "planning") return round.plan.input.ask.id === id
        return true
      }),
    "round key does not match its session id",
  )
  .refine(({ rounds }) => {
    const threads = Object.values(rounds).flatMap((round) => {
      if (round.kind === "active") return [threadOf(round.session.id, round.session.parent)]
      if (round.kind === "preparing") return [threadOf(round.ask.id, round.parent)]
      if (round.kind === "planning")
        return [threadOf(round.plan.input.ask.id, round.plan.input.parent)]
      return []
    })
    return new Set(threads).size === threads.length
  }, "Multiple open rounds share a thread; resolve the competing rounds before loading this checkpoint")
/** The parsed checkout checkpoint. */
export type Checkpoint = z.infer<typeof Checkpoint>

/** Reads a snapshot without recovering writes. Legacy interpretation ends at this boundary. */
export async function readCheckpoint(
  repo: Repo,
): Promise<{ readonly value: Checkpoint; readonly imported: boolean }> {
  const home = homeOf(repo)
  const stored = await readJson(join(home, "checkpoint.json"), Checkpoint)
  if (stored !== null) return { value: stored, imported: false }
  const file = join(home, "live.json")
  const text = await readFile(file, "utf8").catch(absent)
  const raw: unknown = text === null ? null : JSON.parse(text)
  const idle = z.object({ kind: z.literal("steady"), applied: z.null() }).safeParse(raw)
  if (typeof raw === "object" && raw !== null && "applied" in raw && !idle.success)
    throw new Error(
      `morph: ${file} is from an older Morph that still shows a variant; restore its files with git, then delete it`,
    )
  const journal = raw === null || idle.success ? EMPTY_JOURNAL : Journal.parse(raw)
  const rounds: Record<SessionId, z.infer<typeof Round>> = {}
  const names = (await readdir(join(home, "sessions")).catch(absent)) ?? []
  for (const name of names) {
    const id = SessionId.safeParse(name)
    if (!id.success) continue
    const dir = join(home, "sessions", id.data)
    const session = await readJson(join(dir, "session.json"), Session)
    if (session !== null) {
      const jobs: Partial<Record<VariantId, Job>> = {}
      for (const [index] of session.directions.entries()) {
        const variant = VariantId.parse(`v${index + 1}`)
        const jobDir = join(dir, "jobs", variant)
        const pid = await readFile(join(jobDir, "pid"), "utf8").catch(absent)
        if (pid !== null && alive(Number(pid)))
          throw new Error(
            `morph: wait for the legacy worker ${id.data}/${variant} to exit before upgrading`,
          )
        const result = await readJson(join(jobDir, "result.json"), JobResult)
        jobs[variant] = {
          attempt: AttemptId.parse(randomUUID()),
          state: result ?? {
            kind: "failed",
            reason: "interrupted before owned execution; retry this variant",
            retryable: true,
          },
        }
      }
      rounds[id.data] = { kind: "active", session, jobs }
    } else {
      const parent = await readJson(join(dir, "parent.json"), Parent)
      if (parent !== null) rounds[id.data] = { kind: "legacy-refinement", parent }
    }
  }
  return {
    imported: true,
    value: Checkpoint.parse({
      version: 1,
      journal,
      observation: (await readJson(join(home, "observation.json"), Observation)) ?? 0,
      rounds,
    }),
  }
}

/** The current persisted value and commit capability, scoped to one checkout lock acquisition. */
export interface CheckpointStore {
  /** Includes commits made earlier in this acquisition. */
  readonly value: Checkpoint
  /** Atomically replaces metadata while preserving the acquisition's ordering. */
  save(next: Checkpoint): Promise<void>
}

/** Owns metadata publication without applying working-tree writes. */
export function withCheckpoint<T>(
  repo: Repo,
  body: (store: CheckpointStore) => Promise<T>,
): Promise<T> {
  return withLock(join(homeOf(repo), "lock"), async () => {
    const loaded = await readCheckpoint(repo)
    let value = loaded.value
    const save = async (next: Checkpoint) => {
      await writeJson(join(homeOf(repo), "checkpoint.json"), next)
      value = next
    }
    if (loaded.imported) await save(value)
    return body({
      get value() {
        return value
      },
      save,
    })
  })
}
