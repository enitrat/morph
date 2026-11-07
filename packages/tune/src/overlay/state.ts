import { type ThemeName } from "../core/config"
import { type BoxPlace, type Place } from "../inspector/label"
import {
  type Choice,
  type Refine,
  type SessionId,
  type SessionView,
  type VariantId,
} from "../variant/model"

export type Tool = "point" | "box" | "arrow" | "note"

/** A point in document coordinates, so a mark stays on its spot while the page scrolls. */
export interface Spot {
  x: number
  y: number
}

/**
 * A sketch mark as drawn, with the elements it snapped to. `snapped` names them as they were when
 * drawn, since a shown variant may replace those elements: an arrow's whole move, else its element.
 */
export type Sketch = { key: number; snapped: string } & (
  | { kind: "box"; from: Spot; to: Spot; at: Element; place: BoxPlace; label: string }
  | {
      kind: "arrow"
      from: Spot
      to: Spot
      source: Element
      target: Element
      place: Place
      /** Where the head first snapped, and how many ancestors above it `target` is. */
      head: Element
      level: number
    }
  | { kind: "note"; at: Spot; element: Element; text: string }
)

/** What the designer is putting together: what they pointed at, drew and said. */
export interface Draft {
  targets: readonly Element[]
  marks: readonly Sketch[]
  words: string
}

/**
 * An element an ask is about, and where its box's middle was when the ask was sent; `null` once a
 * reload lost the element, which is then picked again at its spot.
 */
export interface Picked {
  element: Element | null
  at: Spot
}

/** The ready variant the designer is giving feedback on, and the feedback so far. */
export interface Refining {
  variant: VariantId
  draft: Draft
  tool: Tool | null
}

/** The variant a refine round keeps, as the panel names it. */
export interface From {
  variant: VariantId
  title: string
}

/** A refine that failed, to send again as it was. */
export interface Retry {
  request: Refine
  from: From
}

/** An operation on the open session the overlay is waiting for. */
type Pending =
  | { kind: "show"; choice: Choice }
  | { kind: "retry"; variant: VariantId }
  | { kind: "keep" }
  | { kind: "discard" }

export type Stage =
  | { kind: "composing"; draft: Draft; tool: Tool | null }
  | {
      kind: "asking"
      draft: Draft
      picked: readonly Picked[]
      id: SessionId
      since: number
      /** Set when this round refines a kept variant. */
      from: From | null
    }
  | {
      kind: "session"
      /** Its marks render until the session ends. */
      draft: Draft
      /** What the ask was about, picked again once a variant is kept. */
      picked: readonly Picked[]
      /** Opened elsewhere than this overlay. */
      adopted: boolean
      id: SessionId
      since: number
      view: SessionView | null
      pending: Pending | null
      retried: Partial<Record<VariantId, number>>
      notice: string | null
      refining: Refining | null
    }
  | { kind: "failed"; draft: Draft; message: string; retry: Retry | null }

export interface State {
  open: boolean
  stage: Stage
}

export type Event =
  | { kind: "toggled" }
  | { kind: "closed" }
  | { kind: "tool"; tool: Tool | null }
  | { kind: "picked"; element: Element; add: boolean }
  | { kind: "unpicked"; element: Element }
  | { kind: "typed"; words: string }
  | { kind: "marked"; mark: Sketch }
  | { kind: "relabeled"; key: number; text: string }
  | {
      kind: "retargeted"
      key: number
      target: Element
      place: Place
      level: number
      snapped: string
    }
  | { kind: "unmarked"; key: number }
  | { kind: "sent"; id: SessionId; at: number; picked: readonly Picked[]; from: From | null }
  | { kind: "refused"; message: string; retry: Retry | null }
  | {
      kind: "joined"
      id: SessionId
      view: SessionView | null
      at: number
      adopted: boolean
      picked: readonly Picked[]
    }
  | { kind: "refine"; variant: VariantId }
  | { kind: "unrefine" }
  | { kind: "viewed"; id: SessionId; view: SessionView }
  | { kind: "pending"; pending: Pending; at: number }
  | { kind: "settled"; view: SessionView | null; notice: string | null }
  | { kind: "ended"; kept: false }
  /** `targets`: what is picked on the kept page. */
  | { kind: "ended"; kept: true; targets: readonly Element[] }
  | { kind: "back" }

const EMPTY: Draft = { targets: [], marks: [], words: "" }

export const initial: State = {
  open: false,
  stage: { kind: "composing", draft: EMPTY, tool: null },
}

const composing = (draft: Draft, tool: Tool | null = null): Stage => ({
  kind: "composing",
  draft,
  tool,
})

function pick(targets: readonly Element[], element: Element, add: boolean): readonly Element[] {
  if (!add) return [element]
  return targets.includes(element)
    ? targets.filter((target) => target !== element)
    : [...targets, element]
}

const relabel = (mark: Sketch, text: string): Sketch =>
  mark.kind === "box" ? { ...mark, label: text } : mark.kind === "note" ? { ...mark, text } : mark

/** The draft after an edit; `null` for an event that does not edit it. */
function edited(draft: Draft, event: Event): Draft | null {
  if (event.kind === "picked")
    return { ...draft, targets: pick(draft.targets, event.element, event.add) }
  if (event.kind === "unpicked")
    return { ...draft, targets: draft.targets.filter((target) => target !== event.element) }
  if (event.kind === "typed") return { ...draft, words: event.words }
  if (event.kind === "marked") return { ...draft, marks: [...draft.marks, event.mark] }
  if (event.kind === "retargeted") {
    const { key, target, place, level, snapped } = event
    return {
      ...draft,
      marks: draft.marks.map((mark) =>
        mark.key === key && mark.kind === "arrow"
          ? { ...mark, target, place, level, snapped }
          : mark,
      ),
    }
  }
  if (event.kind === "relabeled")
    return {
      ...draft,
      marks: draft.marks.map((mark) => (mark.key === event.key ? relabel(mark, event.text) : mark)),
    }
  if (event.kind === "unmarked")
    return { ...draft, marks: draft.marks.filter((mark) => mark.key !== event.key) }
  return null
}

const joined = (draft: Draft, event: Extract<Event, { kind: "joined" }>): Stage => ({
  kind: "session",
  draft,
  picked: event.picked,
  adopted: event.adopted,
  id: event.id,
  since: event.at,
  view: event.view,
  pending: null,
  retried: {},
  notice: null,
  refining: null,
})

const sent = (draft: Draft, event: Extract<Event, { kind: "sent" }>): Stage => ({
  kind: "asking",
  draft,
  picked: event.picked,
  id: event.id,
  since: event.at,
  from: event.from,
})

function compose(stage: Extract<Stage, { kind: "composing" }>, event: Event): Stage {
  if (event.kind === "tool") return { ...stage, tool: event.tool }
  if (event.kind === "sent") return sent(stage.draft, event)
  if (event.kind === "joined") return joined(stage.draft, event)
  const draft = edited(stage.draft, event)
  if (draft === null) return stage
  // A plain pick ends pointing so the designer can type; a Shift pick keeps pointing.
  if (event.kind === "picked") return composing(draft, event.add ? "point" : null)
  return { ...stage, draft }
}

/** Feedback on a variant: what the designer drew and said about it, while it is shown. */
function refining(
  stage: Extract<Stage, { kind: "session" }>,
  current: Refining,
  event: Event,
): Stage {
  if (event.kind === "unrefine") return { ...stage, refining: null }
  if (event.kind === "tool") return { ...stage, refining: { ...current, tool: event.tool } }
  // The new round is about what the kept round was about: its targets are picked again.
  if (event.kind === "sent")
    return sent(
      { ...current.draft, targets: event.picked.flatMap(({ element }) => element ?? []) },
      event,
    )
  const draft = event.kind === "picked" ? null : edited(current.draft, event)
  return draft === null ? stage : { ...stage, refining: { ...current, draft } }
}

function session(stage: Extract<Stage, { kind: "session" }>, event: Event): Stage {
  if (event.kind === "viewed") return event.id === stage.id ? { ...stage, view: event.view } : stage
  if (event.kind === "refine") {
    const ready = stage.view?.variants.some(
      (variant) => variant.id === event.variant && variant.state === "ready",
    )
    if (!ready || stage.refining?.variant === event.variant) return stage
    return { ...stage, refining: { variant: event.variant, draft: EMPTY, tool: null } }
  }
  if (event.kind === "pending") {
    const { pending, at } = event
    const retried =
      pending.kind === "retry" ? { ...stage.retried, [pending.variant]: at } : stage.retried
    // Feedback is about one variant: flipping to another drops it.
    const kept =
      pending.kind === "show" && pending.choice !== stage.refining?.variant ? null : stage.refining
    return { ...stage, pending, notice: null, retried, refining: kept }
  }
  if (stage.refining !== null && event.kind !== "settled" && event.kind !== "ended")
    return refining(stage, stage.refining, event)
  if (event.kind === "settled") {
    const view = event.view ?? stage.view
    if (stage.pending === null && view === stage.view && event.notice === stage.notice) return stage
    return { ...stage, pending: null, view, notice: event.notice }
  }
  // A kept session leaves what it was about picked on the kept page, so the designer can
  // fine-tune it, and keeps pointing so the next click picks rather than presses the page; any
  // other end gives the draft back to change and send again.
  if (event.kind === "ended")
    return event.kept
      ? composing(stage.adopted ? stage.draft : { ...EMPTY, targets: event.targets }, "point")
      : composing(stage.draft)
  return stage
}

function staged(stage: Stage, event: Event): Stage {
  if (stage.kind === "composing") return compose(stage, event)
  if (stage.kind === "session") return session(stage, event)
  if (stage.kind === "failed") {
    if (event.kind === "back") return composing(stage.draft)
    return event.kind === "sent" ? sent(stage.draft, event) : stage
  }
  if (event.kind === "ended") return composing(stage.draft)
  if (event.kind === "joined") return joined(stage.draft, event)
  if (event.kind === "refused")
    return { kind: "failed", draft: stage.draft, message: event.message, retry: event.retry }
  return stage
}

export function reduce(state: State, event: Event): State {
  if (event.kind === "toggled" || event.kind === "closed") {
    const open = event.kind === "toggled" ? !state.open : false
    if (state.stage.kind !== "composing") return { open, stage: state.stage }
    // Opening on an empty draft starts pointing, since picking is the first thing to do.
    const { draft } = state.stage
    const empty = draft.targets.length === 0 && draft.marks.length === 0
    return { open, stage: { ...state.stage, tool: open && empty ? "point" : null } }
  }
  const stage = staged(state.stage, event)
  if (stage === state.stage) return state
  return { open: state.open || event.kind === "joined", stage }
}

/** Whether the draft can be sent: words or a mark, about something picked or marked. */
export const canSend = (draft: Draft) =>
  (draft.words.trim() !== "" || draft.marks.length > 0) &&
  (draft.targets.length > 0 || draft.marks.length > 0)

/** Whether feedback can be sent: words or a mark, on the variant the page shows. */
export const canRefine = (stage: Stage) =>
  stage.kind === "session" &&
  stage.refining !== null &&
  stage.pending === null &&
  shownOf(stage.view) === stage.refining.variant &&
  (stage.refining.draft.words.trim() !== "" || stage.refining.draft.marks.length > 0)

/** Enter makes variants whenever Make variants is enabled, except while pointing, where it picks. */
export const sendsOnEnter = (stage: Stage) =>
  (stage.kind === "composing" && stage.tool !== "point" && canSend(stage.draft)) ||
  (stage.kind === "session" && stage.refining?.tool === null && canRefine(stage))

/** ↑ and ↓ climb and descend the one pick while nothing is typed yet. */
export const climbsOnArrow = (stage: Stage) =>
  stage.kind === "composing" &&
  stage.tool === null &&
  stage.draft.targets.length === 1 &&
  stage.draft.words === ""

/** True while the session still changes on its own: a variant is pending, or nothing is known. */
export function unsettled(stage: Stage): boolean {
  if (stage.kind === "asking") return true
  if (stage.kind !== "session") return false
  return stage.view === null || stage.view.variants.some((variant) => variant.state === "pending")
}

/**
 * The theme an ask is about, when its words name one of `themes` ("lighter in dark mode"), so the
 * page shows it while the variants do; `null` when they name none or several.
 */
export function askedTheme(words: string, themes: readonly ThemeName[]): ThemeName | null {
  const names = themes.map((name) => name.replaceAll("-", String.raw`[\s-]`)).join("|")
  const pattern = new RegExp(String.raw`\b(${names})[\s-]+(?:mode|theme|only)\b`, "gi")
  const named = new Set(
    [...words.matchAll(pattern)].map((match) => match[1]?.toLowerCase().replaceAll(/\s/g, "-")),
  )
  const [only] = named
  return named.size === 1 ? (themes.find((name) => name === only) ?? null) : null
}

/** What the page shows: `original` while the session shows no variant. */
export function shownOf(view: SessionView | null): Choice | null {
  if (view === null) return null
  return view.live?.variant ?? "original"
}
