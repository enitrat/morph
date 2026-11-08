import { z } from "zod"

import { Naming, Tier, TuneConfig } from "./core/config"
import { type DesignSystemWire } from "./core/design-system"
import { Dialed, DialWrite } from "./dial/model"
import { PropControl, PropWrite, PropWritten } from "./dial/props"
import {
  Ask,
  Choice,
  Direction,
  Phase,
  Refine,
  RepoPath,
  SessionId,
  SourceLoc,
  Stat,
  VariantId,
} from "./variant/model"
import { type SessionView } from "./variant/model"

export const MAX_LOCATE_FRAMES = 64
const SessionRef = z.object({ id: SessionId })
const ChoiceRef = SessionRef.extend({ variant: Choice })
const VariantRef = SessionRef.extend({ variant: VariantId })
const AttributeValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.union([z.string(), z.boolean()]) }),
  z.object({ kind: z.literal("forward") }),
  z.object({ kind: z.literal("code") }),
])
const Attribute = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attribute"), name: z.string(), value: AttributeValue }),
  z.object({ kind: z.literal("spread") }),
])
const VariantView = z.discriminatedUnion("state", [
  z.object({
    id: VariantId,
    direction: Direction,
    state: z.literal("pending"),
    phase: z.union([Phase, z.literal("queued")]),
  }),
  z.object({
    id: VariantId,
    direction: Direction,
    state: z.literal("ready"),
    title: z.string(),
    summary: z.string(),
    files: z.array(RepoPath),
    stat: Stat,
  }),
  z.object({
    id: VariantId,
    direction: Direction,
    state: z.literal("failed"),
    reason: z.string(),
    retryable: z.boolean(),
  }),
])
const SessionViewSchema: z.ZodType<SessionView> = z.object({
  id: SessionId,
  live: z.object({ variant: VariantId, edited: z.boolean() }).nullable(),
  variants: z.array(VariantView),
  stuck: z.array(RepoPath).nullable(),
  trail: z.array(z.object({ variant: VariantId, title: z.string(), feedback: z.string() })),
})
const Component = z.object({
  slug: z.string(),
  title: z.string(),
  group: z.string(),
  naming: Naming,
  href: z.string().nullable(),
  importFrom: z.string().nullable(),
  exports: z.array(z.string()),
  namedExports: z.array(z.string()),
  files: z.array(z.string()),
  reads: z.array(z.string()),
  childReads: z.array(z.string()),
  props: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("lab-meta"), meta: z.string() }),
    z.object({ kind: z.literal("cva"), file: z.string() }),
  ]),
})
const DesignSystem: z.ZodType<DesignSystemWire> = z.object({
  files: z.array(z.object({ path: z.string(), css: z.string(), tier: Tier, owned: z.boolean() })),
  themes: TuneConfig.shape.tokens.options[0].shape.themes,
  components: z.array(Component),
  plumbing: TuneConfig.shape.plumbing,
})
export const WireError = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("busy"), session: SessionId }),
  z.object({ kind: z.literal("not-found") }),
  z.object({ kind: z.literal("not-ready"), variant: VariantId }),
  z.object({ kind: z.literal("conflict"), files: z.array(RepoPath) }),
  z.object({ kind: z.literal("planner-failed"), detail: z.string() }),
  z.object({ kind: z.literal("invalid"), detail: z.string() }),
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
  tokens: { response: DesignSystem },
  plumbing: { response: z.object({ plumbing: TuneConfig.shape.plumbing }) },
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
  session: { response: SessionViewSchema },
  ask: { request: Ask, response: SessionViewSchema },
  refine: { request: Refine, response: SessionViewSchema },
  show: { request: ChoiceRef, response: SessionViewSchema },
  retry: { request: VariantRef, response: SessionViewSchema },
  keep: { request: SessionRef, response: z.null() },
  discard: { request: SessionRef, response: z.null() },
} satisfies Record<string, { request?: z.ZodType; response: z.ZodType }>
export type Operation = keyof typeof operations
