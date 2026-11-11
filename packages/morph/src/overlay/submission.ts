import { z } from "zod"

import { Ask, Refine } from "../variant/model"

/** Exact idempotent request retained until acceptance, supersession, or definite refusal. */
export const SubmissionCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("ask"), request: Ask }),
  z.object({ op: z.literal("refine"), request: Refine }),
])
export type SubmissionCommand = z.infer<typeof SubmissionCommand>

export const commandId = (command: SubmissionCommand) =>
  command.op === "ask" ? command.request.id : command.request.ask.id
export const commandWords = (command: SubmissionCommand) =>
  command.op === "ask" ? command.request.words : command.request.ask.words
