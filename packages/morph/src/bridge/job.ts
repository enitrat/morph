import { z } from "zod"

import { MorphConfig } from "../core/config"
import { JobResult, Phase } from "../variant/model"

/** Identifies one execution, independent of its round and reusable variant id. */
export const AttemptId = z.uuid().brand<"AttemptId">()
/** One variant execution's publication authority. */
export type AttemptId = z.infer<typeof AttemptId>

/** A complete job state; launch and claim have distinct process ownership. */
export const Job = z.object({
  attempt: AttemptId,
  state: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("queued"), config: MorphConfig }),
    z.object({ kind: z.literal("starting"), pid: z.int().positive(), config: MorphConfig }),
    z.object({
      kind: z.literal("running"),
      pid: z.int().positive(),
      phase: z.union([Phase, z.literal("queued")]),
    }),
    ...JobResult.options,
  ]),
})
/** The durable state of one variant attempt. */
export type Job = z.infer<typeof Job>
