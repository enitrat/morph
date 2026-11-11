import { z } from "zod"

import { MorphConfig } from "../core/config"
import { Ask, CommitId, Parent, Seq } from "../variant/model"
import { AttemptId } from "./job"

/** Execution settings saved when the ask is accepted, including across refinement recovery. */
export const PlanRecipe = z.object({
  config: MorphConfig,
  model: z.string(),
  deadlineMs: z.int().positive(),
})

/** Complete immutable inputs to one planner attempt. */
export const PlanInput = z.object({
  ask: Ask,
  parent: Parent.nullable(),
  base: CommitId,
  opened: Seq,
  recipe: PlanRecipe,
})
export type PlanInput = z.infer<typeof PlanInput>

/** A planner attempt, from durable acceptance through execution or explicit failure. */
export const Plan = z.object({
  input: PlanInput,
  attempt: AttemptId,
  state: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("queued") }),
    z.object({ kind: z.literal("starting"), pid: z.int().positive() }),
    z.object({ kind: z.literal("running"), pid: z.int().positive() }),
    z.object({ kind: z.literal("failed"), reason: z.string() }),
  ]),
})
export type Plan = z.infer<typeof Plan>
