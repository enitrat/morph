import type { AskNode, Manifest, RevisionNode, SceneNode, VariantNode } from "./manifest"
import { type Matched, matchAsk } from "./match"
import type {
  Choice,
  PageView,
  Refusal,
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

/** One ask on the playground. Only facts are stored: place and phases are derived on read. */
interface StageSession {
  readonly id: SessionId
  readonly scene: SceneNode
  readonly ask: AskNode
  readonly askedAt: number
  /**
   * Page polls answered so far. A variant counts as ready only after one, so the overlay has seen
   * the session show the original for a whole poll and measured it before anything changes.
   */
  readonly polls: number
  /** What the designer last chose; null until they choose. */
  readonly want: Choice | null
  /** The first ready variant, shown by a page poll while the designer has chosen nothing. */
  readonly auto: VariantId | null
  readonly trail: readonly Step[]
}

interface StageState {
  /** Oldest ask first, as the page view lists them. */
  readonly sessions: readonly StageSession[]
  /** Each scene's revision after its kept variants; a scene with none shows its original. */
  readonly kept: Readonly<Record<string, RevisionNode>>
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; refusal: Refusal }

const refuse = (refusal: Refusal): Result<never> => ({ ok: false, refusal })
const done = <T>(value: T): Result<T> => ({ ok: true, value })

const AT = { v1: 0, v2: 1, v3: 2 } as const
const variantOf = (session: StageSession, id: VariantId): VariantNode =>
  session.ask.variants[AT[id]]

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
      summary: meta.summary,
      files: variant.files,
      stat: variant.stat,
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

/**
 * Where every session stands, in ask order: a session that wants a variant shows it, unless an
 * older session of the same scene already shows one, in which case it waits on that one.
 */
function placesOf(sessions: readonly StageSession[]): Map<SessionId, Place> {
  const places = new Map<SessionId, Place>()
  const showing = new Map<string, { session: StageSession; variant: VariantNode }>()
  for (const session of sessions) {
    const choice = session.want ?? session.auto ?? "original"
    if (choice === "original") {
      places.set(session.id, { kind: "original" })
      continue
    }
    const holder = showing.get(session.scene.id)
    if (holder === undefined) {
      showing.set(session.scene.id, { session, variant: variantOf(session, choice) })
      places.set(session.id, { kind: "shown", variant: choice, edited: false })
    } else
      places.set(session.id, {
        kind: "waiting",
        variant: choice,
        on: [
          { session: holder.session.id, variant: holder.variant.id, files: holder.variant.files },
        ],
      })
  }
  return places
}

export interface AskInput {
  readonly id: SessionId
  /** Where the first target's JSX is, which names the scene. */
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
  /** What a scene's slot renders: a shown variant, else the scene's kept revision. Stable between changes. */
  shown(scene: string): RevisionNode
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
  /** The answer to a page poll, which also auto-shows a session's first ready variant. */
  poll(now: number): PageView
  page(now: number): PageView
  suggestions(at: { path: string } | { session: SessionId }): readonly Suggestion[]
}

export function createStage(manifest: Manifest): Stage {
  let state: StageState = { sessions: [], kept: {} }
  const listeners = new Set<() => void>()

  const set = (next: StageState) => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  const keptOf = (scene: SceneNode) => state.kept[scene.id] ?? scene.original
  const find = (id: SessionId) => state.sessions.find((session) => session.id === id)
  const withSession = (id: SessionId, edit: (session: StageSession) => StageSession) =>
    set({
      ...state,
      sessions: state.sessions.map((session) => (session.id === id ? edit(session) : session)),
    })
  const without = (id: SessionId) => state.sessions.filter((session) => session.id !== id)

  const page = (now: number): PageView => {
    const places = placesOf(state.sessions)
    return {
      sessions: state.sessions.map((session) => ({
        id: session.id,
        // SAFETY: placesOf sets a place for every session it is given.
        place: places.get(session.id) as Place,
        variants: session.ask.variants.map((variant) => viewOfVariant(session, variant, now)),
        trail: session.trail,
        drift: [],
      })),
      stuck: [],
    }
  }

  const plan = (
    input: AskInput,
  ): Result<{ scene: SceneNode; matched: Matched & { ask: AskNode } }> => {
    const scene = manifest.sceneAt(input.path)
    if (scene === null)
      return refuse({
        kind: "planner-failed",
        detail: `no model runs on this page, and ${input.path} has no recorded asks. Pick a card on the board.`,
      })
    const asks = keptOf(scene).asks
    const matched = matchAsk(asks, input.words)
    if (matched.kind === "none")
      return refuse({
        kind: "planner-failed",
        detail:
          asks.length === 0
            ? `no model runs on this page, and ${scene.entry} has no recorded asks from here. Discard to go back.`
            : `no model runs on this page. ${scene.entry} replays ${asks.map((ask) => `"${ask.words}"`).join(", ")}; pick one, or install Morph to ask anything.`,
      })
    return done({ scene, matched })
  }

  const open = (
    input: AskInput,
    planned: { scene: SceneNode; matched: Matched & { ask: AskNode } },
    now: number,
    trail: readonly Step[],
  ) => {
    set({
      ...state,
      sessions: [
        ...state.sessions,
        {
          id: input.id,
          scene: planned.scene,
          ask: planned.matched.ask,
          askedAt: now,
          polls: 0,
          want: null,
          auto: null,
          trail,
        },
      ],
    })
    return done<Matched>(planned.matched)
  }

  const keep = (id: SessionId, variant: VariantId): Result => {
    const session = find(id)
    if (session === undefined) return refuse({ kind: "not-found" })
    const place = placesOf(state.sessions).get(id)
    const holds =
      (place?.kind === "shown" || place?.kind === "waiting") && place.variant === variant
    if (!holds) return refuse({ kind: "not-shown", variant })
    set({
      sessions: without(id),
      kept: { ...state.kept, [session.scene.id]: variantOf(session, variant).revision },
    })
    return done(undefined)
  }

  return {
    manifest,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    shown(sceneId) {
      const places = placesOf(state.sessions)
      for (const session of state.sessions) {
        const place = places.get(session.id)
        if (session.scene.id === sceneId && place?.kind === "shown")
          return variantOf(session, place.variant).revision
      }
      const scene = manifest.scenes.find((candidate) => candidate.id === sceneId)
      if (scene === undefined) throw new Error(`no scene ${sceneId}`)
      return keptOf(scene)
    },
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
      withSession(id, (current) => ({ ...current, want: choice }))
      return done(undefined)
    },
    keep,
    discard(id) {
      if (find(id) === undefined) return refuse({ kind: "not-found" })
      set({ ...state, sessions: without(id) })
      return done(undefined)
    },
    retry(id) {
      return find(id) === undefined ? refuse({ kind: "not-found" }) : done(undefined)
    },
    poll(now) {
      const places = placesOf(state.sessions)
      const held = new Set(
        state.sessions
          .filter((session) => places.get(session.id)?.kind === "shown")
          .map((session) => session.scene.id),
      )
      set({
        ...state,
        sessions: state.sessions.map((session) => {
          const first =
            session.want === null && session.auto === null && !held.has(session.scene.id)
              ? session.ask.variants.find((variant) => isReady(session, variant, now))
              : undefined
          if (first !== undefined) held.add(session.scene.id)
          return { ...session, polls: session.polls + 1, auto: first?.id ?? session.auto }
        }),
      })
      return page(now)
    },
    page,
    suggestions(at) {
      if ("path" in at) {
        const scene = manifest.sceneAt(at.path)
        return scene === null
          ? []
          : keptOf(scene).asks.map((ask) => ({ words: ask.words, kind: "house" as const }))
      }
      const session = find(at.session)
      const place = session && placesOf(state.sessions).get(session.id)
      if (session === undefined || place?.kind !== "shown") return []
      return variantOf(session, place.variant).revision.asks.map((ask) => ({
        words: ask.words,
        kind: "refine" as const,
      }))
    },
  }
}
