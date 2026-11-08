import { z } from "zod"

const objectId = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)

export const BlobId = objectId.brand<"BlobId">()
export type BlobId = z.infer<typeof BlobId>

export const CommitId = objectId.brand<"CommitId">()
export type CommitId = z.infer<typeof CommitId>

/** Posix, relative to the repo root, never leaving it. */
export const RepoPath = z
  .string()
  .refine(
    (path) =>
      path !== "" &&
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "not a repo-relative posix path",
  )
  .brand<"RepoPath">()
export type RepoPath = z.infer<typeof RepoPath>

/** Made by the client, so a re-posted ask finds the session it already started. */
export const SessionId = z.uuid().brand<"SessionId">()
export type SessionId = z.infer<typeof SessionId>

export const VariantId = z.enum(["v1", "v2", "v3"])
export type VariantId = z.infer<typeof VariantId>

/** What the designer flips to: a variant, or the code as it was before the session. */
export const Choice = z.union([VariantId, z.literal("original")])
export type Choice = z.infer<typeof Choice>

/** A path's content, or its absence: a variant may add or delete files. */
export const Content = BlobId.nullable()
export type Content = z.infer<typeof Content>

/** A finished variant: `commit` is `base` plus the agent's edits to `files`. */
export interface Target {
  readonly session: SessionId
  readonly variant: VariantId
  readonly base: CommitId
  readonly commit: CommitId
  readonly files: readonly RepoPath[]
}

const AppliedFile = z.object({ path: RepoPath, before: Content, after: Content })
export type AppliedFile = z.infer<typeof AppliedFile>

/** The single record of what the live tree holds on top of no variant. */
export const Applied = z.object({
  session: SessionId,
  variant: VariantId,
  /** `before` is the content without any variant, `after` what the tool last wrote. */
  files: z.array(AppliedFile).readonly(),
})
export type Applied = z.infer<typeof Applied>

export const FileWrite = z.object({ path: RepoPath, expect: Content, write: Content })
export type FileWrite = z.infer<typeof FileWrite>

/** The write-ahead journal: written before any working-tree file, by one writer under a lock. */
export const Journal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("steady"), applied: Applied.nullable() }),
  z.object({
    kind: z.literal("moving"),
    to: Applied.nullable(),
    writes: z.array(FileWrite).readonly(),
  }),
  /** Recovery met files that are neither the expected nor the written content. */
  z.object({
    kind: z.literal("stuck"),
    applied: Applied.nullable(),
    conflicts: z.array(RepoPath).readonly(),
  }),
])
export type Journal = z.infer<typeof Journal>

/** A JSX call site in the repo, 1-based. */
export const SourceLoc = z.object({
  path: RepoPath,
  line: z.int().positive(),
  col: z.int().positive(),
})
export type SourceLoc = z.infer<typeof SourceLoc>

/** An element the designer pointed at: where its JSX is, who renders it, and its text. */
export const Anchor = z.object({
  source: SourceLoc,
  owner: z.array(z.string()).readonly(),
  text: z.string(),
})
export type Anchor = z.infer<typeof Anchor>

const Place = z.enum(["before", "after", "inside"])
const BoxPlace = z.enum(["before", "after", "inside", "around"])

export const Mark = z.discriminatedUnion("kind", [
  /** "a Notice goes here" */
  z.object({ kind: z.literal("box"), at: Anchor, place: BoxPlace, label: z.string() }),
  /** this element moves there */
  z.object({ kind: z.literal("arrow"), from: Anchor, to: Anchor, place: Place }),
  z.object({ kind: z.literal("note"), at: Anchor, text: z.string() }),
])
export type Mark = z.infer<typeof Mark>

export const Ask = z.object({
  id: SessionId,
  words: z.string().trim().min(1),
  targets: z.array(Anchor).min(1).readonly(),
  marks: z.array(Mark).readonly().default([]),
  count: z.int().min(1).max(3).default(3),
})
export type Ask = z.infer<typeof Ask>

/** One way to make the change: a short title the panel shows, and the line the agent follows. */
export const Direction = z.object({
  title: z.string().min(1).describe("At most six words naming this direction."),
  description: z.string().min(1).describe("One sentence on what this direction does."),
})
export type Direction = z.infer<typeof Direction>

/** The variant a refine round kept, with the words of the round that made it and the rounds before. */
export interface Parent {
  readonly session: SessionId
  readonly variant: VariantId
  readonly title: string
  readonly summary: string
  readonly words: string
  readonly parent: Parent | null
}
export const Parent: z.ZodType<Parent> = z.object({
  session: SessionId,
  variant: VariantId,
  title: z.string(),
  summary: z.string(),
  words: z.string(),
  parent: z.lazy(() => Parent).nullable(),
})

/** Keeps `variant` of the open session `from`, then asks again on top of it. */
export const Refine = z.object({ from: SessionId, variant: VariantId, ask: Ask })
export type Refine = z.infer<typeof Refine>

/** Written once per ask; variant `v<n>` follows `directions[n - 1]`. */
export const Session = z.object({
  id: SessionId,
  base: CommitId,
  ask: Ask,
  directions: z.array(Direction).min(1).max(3).readonly(),
  /** The kept variant this round refines; sessions written before refining existed have none. */
  parent: Parent.nullable().default(null),
})
export type Session = z.infer<typeof Session>

/** One kept variant on the way to a round, and the feedback the next round asked of it. */
export interface Step {
  variant: VariantId
  title: string
  feedback: string
}

/** The kept variants a round with these `words` stands on, oldest first. */
export function trailOf(words: string, parent: Parent | null): Step[] {
  if (parent === null) return []
  return [
    ...trailOf(parent.words, parent.parent),
    { variant: parent.variant, title: parent.title, feedback: words },
  ]
}

export const Phase = z.enum(["slot", "agent", "checks", "retry", "capture"])
export type Phase = z.infer<typeof Phase>

export const Stat = z.object({ add: z.int(), del: z.int() })
export type Stat = z.infer<typeof Stat>

/** What a finished job leaves in its directory; a job without one is pending or interrupted. */
export const JobResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    commit: CommitId,
    title: z.string(),
    summary: z.string(),
    files: z.array(RepoPath).min(1).readonly(),
    stat: Stat,
    ms: z.object({ agent: z.number(), checks: z.number(), total: z.number() }),
  }),
  z.object({ kind: z.literal("failed"), reason: z.string(), retryable: z.boolean() }),
])
export type JobResult = z.infer<typeof JobResult>

const repoPaths: z.ZodType<readonly RepoPath[]> = z.array(RepoPath)

/** The current state of one variant in the overlay. */
export const VariantView = z.discriminatedUnion("state", [
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
    files: repoPaths,
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
/** The current state of one variant in the overlay. */
export type VariantView = z.infer<typeof VariantView>

const variantViews: z.ZodType<readonly VariantView[]> = z.array(VariantView)
const steps: z.ZodType<readonly Step[]> = z.array(
  z.object({ variant: VariantId, title: z.string(), feedback: z.string() }),
)

/** Everything the overlay renders, derived once on the bridge. */
export const SessionView = z.object({
  id: SessionId,
  /** `edited`: the designer changed a shown file after the tool wrote it. */
  live: z.object({ variant: VariantId, edited: z.boolean() }).nullable(),
  variants: variantViews,
  stuck: repoPaths.nullable(),
  /** Empty in a first round. */
  trail: steps,
})
/** Everything the overlay renders, derived once on the bridge. */
export type SessionView = z.infer<typeof SessionView>

/** Application failures the bridge can return to the overlay. */
export const Refusal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("busy"), session: SessionId }),
  z.object({ kind: z.literal("not-found") }),
  z.object({ kind: z.literal("not-ready"), variant: VariantId }),
  z.object({
    kind: z.literal("conflict"),
    files: repoPaths,
  }),
  z.object({ kind: z.literal("planner-failed"), detail: z.string() }),
  z.object({ kind: z.literal("invalid"), detail: z.string() }),
])
/** Application failures the bridge can return to the overlay. */
export type Refusal = z.infer<typeof Refusal>
