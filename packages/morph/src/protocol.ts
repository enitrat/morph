import { z } from "zod"

import { MorphConfig } from "./core/config"
import { DesignSystemWire } from "./core/design-system"
import { Attribute } from "./dial/jsx"
import { Dialed, DialWrite } from "./dial/model"
import { PropControl, PropWrite, PropWritten } from "./dial/props"
import {
  Ask,
  Choice,
  Refine,
  SessionId,
  PageView,
  SourceLoc,
  Refusal,
  VariantId,
} from "./variant/model"

export const MAX_LOCATE_FRAMES = 64
const SessionRef = z.object({ id: SessionId })
const ChoiceRef = SessionRef.extend({ variant: Choice })
const VariantRef = SessionRef.extend({ variant: VariantId })
export const WireError = z.discriminatedUnion("kind", [
  ...Refusal.options,
  z.object({ kind: z.literal("bad-request"), issues: z.array(z.string()) }),
  z.object({ kind: z.literal("method") }),
  z.object({ kind: z.literal("crashed"), detail: z.string() }),
])
export type WireError = z.infer<typeof WireError>

export const operations = {
  locate: {
    request: z.object({ frames: z.array(z.string()).min(1).max(MAX_LOCATE_FRAMES) }),
    response: z.object({ sources: z.array(SourceLoc.nullable()) }),
  },
  tokens: { response: DesignSystemWire },
  plumbing: { response: z.object({ plumbing: MorphConfig.shape.plumbing }) },
  tag: { response: z.object({ classes: z.array(z.string()) }) },
  props: { response: z.object({ controls: z.array(PropControl) }) },
  uses: { response: z.object({ uses: z.number(), examples: z.number() }) },
  attributes: {
    response: z.object({
      tag: z.object({ name: z.string(), attributes: z.array(Attribute) }).nullable(),
    }),
  },
  prop: { request: PropWrite, response: PropWritten },
  dial: { request: DialWrite, response: Dialed },
  page: { response: PageView },
  ask: { request: Ask, response: PageView },
  refine: { request: Refine, response: PageView },
  show: { request: ChoiceRef, response: PageView },
  retry: { request: VariantRef, response: PageView },
  keep: { request: VariantRef, response: PageView },
  discard: { request: SessionRef, response: PageView },
} satisfies Record<string, { request?: z.ZodType; response: z.ZodType }>
export type Operation = keyof typeof operations
