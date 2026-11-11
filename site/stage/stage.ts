import type { AskNode, Level, Manifest, Repo, Revision, VariantNode } from "./manifest"
import { type Matched, matchAsk } from "./match"
import type {
  Choice,
  PageView,
  Refusal,
  RepoPath,
  SessionId,
  SessionView,
  Step,
  VariantId,
  VariantView,
} from "./wire"

/** Recorded job times play this many times faster, so a first variant lands in about 3 s. */
export const REPLAY_SPEED = 30
/** Recorded milliseconds each early phase lasts, before the variant's own agent and checks times. */
const QUEUED_MS = 6000
const SLOT_MS = 15000

/** A designer's choice, ordered by when it was made: the newer want takes a file first. */
interface Want {
  readonly choice: Choice
  readonly seq: number
}

/** One ask on the playground. Only facts are stored: place and phases are derived on read. */
interface StageSession {
  readonly id: SessionId
  readonly ask: AskNode
  /** The revision of the ask's file the repo kept when it was asked: its variants rewrite it. */
  readonly base: Revision
  /** The visitor's words matched a recorded ask's phrasing exactly, or only came closest. */
  readonly matched: Matched["kind"]
  readonly askedAt: number
  /**
   * Page polls answered so far. A variant counts as ready only after one, so the overlay has seen
   * the session show the original for a whole poll and measured it before anything changes.
   */
  readonly polls: number
  readonly want: Want | null
  /** The first ready variant, which a page poll picks while the designer has chosen nothing. */
  readonly auto: VariantId | null
  readonly trail: readonly Step[]
}

/** A kept state of the whole repo. Each keep adds one under the version it was made on. */
export interface Version {
  readonly id: number
  readonly parent: number | null
  readonly repo: Repo
  /** The variant whose keep made this version; null for the original. */
  readonly kept: VariantNode | null
}

/** What happened on the stage, oldest first: the coach reads it. */
export type LogEntry = {
  readonly op: "ask" | "show" | "keep" | "discard"
  readonly level: Level
  readonly path: RepoPath
}

interface StageState {
  /** Oldest ask first, as the page view lists them. */
  readonly sessions: readonly StageSession[]
  /** Never empty: the original is version 0. */
  readonly versions: readonly Version[]
  /** The version the board stands on; its repo is the kept code. */
  readonly at: number
  readonly log: readonly LogEntry[]
  readonly seq: number
}

/** What the page draws from: stable between changes, so React can subscribe to it. */
export interface Snapshot {
  /** The kept repo with every shown variant written over it. */
  readonly shown: Repo
  readonly kept: Repo
  readonly versions: readonly Version[]
  readonly at: number
  readonly log: readonly LogEntry[]
  /** Every open session's ask and place, oldest first, for chrome that drives the stage itself. */
  readonly sessions: readonly {
    readonly id: SessionId
    readonly ask: AskNode
    readonly place: Place
  }[]
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; refusal: Refusal }

const refuse = (refusal: Refusal): Result<never> => ({ ok: false, refusal })
const done = <T>(value: T): Result<T> => ({ ok: true, value })

const AT = { v1: 0, v2: 1, v3: 2 } as const
const variantOf = (session: StageSession, id: VariantId): VariantNode =>
  session.ask.variants[AT[id]]
const fileOf = (session: StageSession) => session.ask.base.file.path

const isReady = (session: StageSession, variant: VariantNode, now: number) =>
  session.polls >= 1 && (now - session.askedAt) * REPLAY_SPEED >= variant.meta.ms.total

function viewOfVariant(session: StageSession, variant: VariantNode, now: number): VariantView {
  const { id, meta } = variant
  if (isReady(session, variant, now))
    return {
      id,
      direction: meta.direction,
      state: "ready",
      title: meta.title,
      summary:
        session.matched === "closest"
          ? `Closest recorded ask: “${session.ask.words}”. ${meta.summary}`
          : meta.summary,
      files: [fileOf(session)],
      stat: session.base.file.stat(session.base, variant.revision),
    }
  const elapsed = (now - session.askedAt) * REPLAY_SPEED
  const phase =
    elapsed < QUEUED_MS
      ? "queued"
      : elapsed < SLOT_MS
        ? "slot"
        : elapsed < SLOT_MS + meta.ms.agent
          ? "agent"
          : elapsed < SLOT_MS + meta.ms.agent + meta.ms.checks
            ? "checks"
            : "capture"
  return { id, direction: meta.direction, state: "pending", phase }
}

type Place = SessionView["place"]

const choiceOf = (session: StageSession): Choice =>
  session.want?.choice ?? session.auto ?? "original"

/** A designer's want first, the newer first; then each first ready variant, the newer ask first. */
const byRank = (a: StageSession, b: StageSession) =>
  (b.want?.seq ?? -1) - (a.want?.seq ?? -1) ||
  b.askedAt - a.askedAt ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Where every session stands, as the bridge settles it. Sessions claim their file in rank order:
 * one whose file another session already claimed waits on it. A session asked on a revision the
 * repo no longer holds, because another ask on its file was kept, cannot move its file.
 */
function placesOf(sessions: readonly StageSession[], kept: Repo): Map<SessionId, Place> {
  const places = new Map<SessionId, Place>()
  const claims = new Map<RepoPath, { session: SessionId; variant: VariantId }>()
  for (const session of sessions.toSorted(byRank)) {
    const choice = choiceOf(session)
    const file = fileOf(session)
    const holder = claims.get(file)
    if (choice === "original") places.set(session.id, { kind: "original" })
    else if (kept.get(file) !== session.base)
      places.set(session.id, { kind: "conflict", want: choice, files: [file], showing: null })
    else if (holder !== undefined)
      places.set(session.id, {
        kind: "waiting",
        variant: choice,
        on: [{ session: holder.session, variant: holder.variant, files: [file] }],
      })
    else {
      claims.set(file, { session: session.id, variant: choice })
      places.set(session.id, { kind: "shown", variant: choice, edited: false })
    }
  }
  return places
}

export interface AskInput {
  readonly id: SessionId
  /** Where the first target's JSX is, which names the file. */
  readonly path: string
  readonly words: string
}

export interface Suggestion {
  readonly words: string
  readonly kind: "house" | "refine"
}

export interface Stage {
  readonly manifest: Manifest
  subscribe(listener: () => void): () => void
  snapshot(): Snapshot
  /** Free text snaps to the closest recorded ask, or refuses as a planner would. Idempotent on `id`. */
  ask(input: AskInput, now: number): Result<Matched>
  /** Keeps `variant` of `from`, then asks again on top of it. */
  refine(
    input: { from: SessionId; variant: VariantId; ask: AskInput },
    now: number,
  ): Result<Matched>
  show(id: SessionId, choice: Choice, now: number): Result
  keep(id: SessionId, variant: VariantId): Result
  discard(id: SessionId): Result
  retry(id: SessionId): Result
  /** Back to the original, with no history. */
  reset(): void
  /** The answer to a page poll, which also picks each session's first ready variant. */
  poll(now: number): PageView
  page(now: number): PageView
  suggestions(at: { path: string } | { session: SessionId }): readonly Suggestion[]
}

export function createStage(manifest: Manifest): Stage {
  const initial: StageState = {
    sessions: [],
    versions: [{ id: 0, parent: null, repo: manifest.original, kept: null }],
    at: 0,
    log: [],
    seq: 0,
  }
  let state = initial
  let drawn: { from: StageState; snapshot: Snapshot } | null = null
  const listeners = new Set<() => void>()

  const set = (next: StageState) => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  // SAFETY: `at` always names a version in the list.
  const keptRepo = () => (state.versions[state.at] as Version).repo
  const places = () => placesOf(state.sessions, keptRepo())
  const find = (id: SessionId) => state.sessions.find((session) => session.id === id)
  const without = (id: SessionId) => state.sessions.filter((session) => session.id !== id)
  const logged = (op: LogEntry["op"], session: StageSession): LogEntry[] => [
    ...state.log,
    { op, level: session.ask.base.file.level, path: fileOf(session) },
  ]

  const snapshot = (): Snapshot => {
    if (drawn?.from === state) return drawn.snapshot
    const kept = keptRepo()
    const placed = places()
    const shown = new Map(kept)
    const sessions = state.sessions.map((session) => {
      // SAFETY: placesOf places every session it is given.
      const place = placed.get(session.id) as Place
      if (place.kind === "shown")
        shown.set(fileOf(session), variantOf(session, place.variant).revision)
      return { id: session.id, ask: session.ask, place }
    })
    drawn = {
      from: state,
      snapshot: { shown, kept, versions: state.versions, at: state.at, log: state.log, sessions },
    }
    return drawn.snapshot
  }

  const page = (now: number): PageView => {
    const placed = places()
    return {
      sessions: state.sessions.map((session) => ({
        id: session.id,
        // SAFETY: placesOf places every session it is given.
        place: placed.get(session.id) as Place,
        variants: session.ask.variants.map((variant) => viewOfVariant(session, variant, now)),
        trail: session.trail,
        drift: [],
      })),
      stuck: [],
    }
  }

  const plan = (input: AskInput): Result<Matched & { ask: AskNode }> => {
    const file = manifest.fileAt(input.path)
    if (file === undefined)
      return refuse({
        kind: "planner-failed",
        detail: `no model runs on this page, and ${input.path} has no recorded asks. Pick an object on the board.`,
      })
    const asks = manifest.offeredAt(file, keptRepo())
    const matched = matchAsk(asks, input.words)
    if (matched.kind === "none")
      return refuse({
        kind: "planner-failed",
        detail:
          asks.length === 0
            ? `no model runs on this page, and ${file.name} has no recorded asks from here. Pick another part.`
            : `no model runs on this page. ${file.name} replays ${asks.map((ask) => `"${ask.words}"`).join(", ")}; pick one, or install Morph to ask anything.`,
      })
    return done(matched)
  }

  const open = (
    input: AskInput,
    matched: Matched & { ask: AskNode },
    now: number,
    trail: readonly Step[],
  ) => {
    const file = matched.ask.base.file
    const session: StageSession = {
      id: input.id,
      ask: matched.ask,
      base: keptRepo().get(file.path) ?? file.original,
      matched: matched.kind,
      askedAt: now,
      polls: 0,
      want: null,
      auto: null,
      trail,
    }
    set({ ...state, sessions: [...state.sessions, session], log: logged("ask", session) })
    return done<Matched>(matched)
  }

  const keep = (id: SessionId, variant: VariantId): Result => {
    const session = find(id)
    if (session === undefined) return refuse({ kind: "not-found" })
    const place = places().get(id)
    if (place?.kind === "conflict") return refuse({ kind: "conflict", files: place.files })
    const holds =
      (place?.kind === "shown" || place?.kind === "waiting") && place.variant === variant
    if (!holds) return refuse({ kind: "not-shown", variant })
    const kept = variantOf(session, variant)
    const repo = new Map(keptRepo()).set(fileOf(session), kept.revision)
    const version: Version = { id: state.versions.length, parent: state.at, repo, kept }
    set({
      ...state,
      sessions: without(id),
      versions: [...state.versions, version],
      at: version.id,
      log: logged("keep", session),
    })
    return done(undefined)
  }

  return {
    manifest,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot,
    ask(input, now) {
      const existing = find(input.id)
      if (existing !== undefined) return done<Matched>({ kind: "exact", ask: existing.ask })
      const planned = plan(input)
      return planned.ok ? open(input, planned.value, now, []) : planned
    },
    refine({ from, variant, ask }, now) {
      const parent = find(from)
      if (parent === undefined) return refuse({ kind: "not-found" })
      const step: Step = {
        variant,
        title: variantOf(parent, variant).meta.title,
        feedback: ask.words,
      }
      const kept = keep(from, variant)
      if (!kept.ok) return kept
      const planned = plan(ask)
      return planned.ok ? open(ask, planned.value, now, [...parent.trail, step]) : planned
    },
    show(id, choice, now) {
      const session = find(id)
      if (session === undefined) return refuse({ kind: "not-found" })
      if (choice !== "original" && !isReady(session, variantOf(session, choice), now))
        return refuse({ kind: "not-ready", variant: choice })
      const seq = state.seq + 1
      set({
        ...state,
        seq,
        sessions: state.sessions.map((current) =>
          current.id === id ? { ...current, want: { choice, seq } } : current,
        ),
        log: logged("show", session),
      })
      return done(undefined)
    },
    keep,
    discard(id) {
      const session = find(id)
      if (session === undefined) return refuse({ kind: "not-found" })
      set({ ...state, sessions: without(id), log: logged("discard", session) })
      return done(undefined)
    },
    retry(id) {
      return find(id) === undefined ? refuse({ kind: "not-found" }) : done(undefined)
    },
    reset() {
      set(initial)
    },
    poll(now) {
      set({
        ...state,
        sessions: state.sessions.map((session) => {
          const first =
            session.want === null && session.auto === null
              ? session.ask.variants.find((variant) => isReady(session, variant, now))
              : undefined
          return { ...session, polls: session.polls + 1, auto: first?.id ?? session.auto }
        }),
      })
      return page(now)
    },
    page,
    suggestions(at) {
      if ("path" in at) {
        const file = manifest.fileAt(at.path)
        return file === undefined
          ? []
          : manifest
              .offeredAt(file, keptRepo())
              .map((ask) => ({ words: ask.words, kind: "house" as const }))
      }
      const session = find(at.session)
      const place = session && places().get(session.id)
      if (session === undefined || place?.kind !== "shown") return []
      return variantOf(session, place.variant).revision.asks.map((ask) => ({
        words: ask.words,
        kind: "refine" as const,
      }))
    },
  }
}
