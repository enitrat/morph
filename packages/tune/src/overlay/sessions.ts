import {
  type Hold,
  type PageView,
  type SessionId,
  type SessionView,
  type VariantId,
  type VariantView,
} from "../variant/model"
import { type Picked } from "./repick"
import { type Spec } from "./specs"

/**
 * What the overlay keeps about one session that the page view does not say. Where the session
 * stands (shown, waiting, conflict) is never copied here: it is read off the latest `PageView`.
 */
export interface Pin {
  id: SessionId
  /** Its number on the page, kept by every refine round. */
  n: number
  name: string
  /** The file the target is written in, as `card.tsx`. */
  file: string | null
  /** What the ask is about, to find again after a reload or once a variant redraws it. */
  picked: readonly Picked[]
  /** `false` until a page view lists it, so a poll that crossed the ask does not drop it. */
  joined: boolean
  /** The refine field's words. */
  refine: string
  /** The target as the original draws it, measured while the session showed nothing. */
  baseline: Spec | null
}

export type Tone = "info" | "warn"

export interface Notice {
  key: number
  text: string
  tone: Tone
}

export interface Sessions {
  page: PageView
  pins: Readonly<Partial<Record<SessionId, Pin>>>
  /** The session whose thread card is open. */
  card: SessionId | null
  notice: Notice | null
}

export const NO_SESSIONS: Sessions = {
  page: { sessions: [], stuck: [] },
  pins: {},
  card: null,
  notice: null,
}

/** A pin as an ask or a reload makes it, before the overlay numbers it. */
export type NewPin = Omit<Pin, "n" | "joined" | "refine"> & { n: number | null }

export type SessionEvent =
  | { kind: "page"; page: PageView }
  | { kind: "asked"; pin: NewPin }
  /** Sessions a reload found open, with what the last tab stored about them. */
  | { kind: "rejoined"; pins: readonly NewPin[] }
  /** A refine round replaced `from` with `id` on the same pin. */
  | { kind: "refined"; from: SessionId; id: SessionId }
  /** An ask the bridge refused: its pin goes. */
  | { kind: "dropped"; id: SessionId; text: string }
  | { kind: "card"; id: SessionId | null }
  | { kind: "cycled"; by: 1 | -1 }
  | { kind: "refining"; id: SessionId; words: string }
  | { kind: "measured"; id: SessionId; baseline: Spec }
  | { kind: "retargeted"; id: SessionId; picked: readonly Picked[] }
  | { kind: "notice"; text: string; tone: Tone }
  | { kind: "unnoticed"; key: number }

const nextN = (pins: Sessions["pins"]) =>
  Math.max(0, ...Object.values(pins).map((pin) => pin?.n ?? 0)) + 1

function add(state: Sessions, pin: NewPin, joined: boolean): Sessions {
  const n = pin.n ?? nextN(state.pins)
  return {
    ...state,
    pins: { ...state.pins, [pin.id]: { ...pin, n, joined, refine: "" } },
  }
}

function edit(state: Sessions, id: SessionId, change: (pin: Pin) => Pin): Sessions {
  const pin = state.pins[id]
  return pin === undefined ? state : { ...state, pins: { ...state.pins, [id]: change(pin) } }
}

function noticed(state: Sessions, text: string, tone: Tone): Sessions {
  return { ...state, notice: { key: (state.notice?.key ?? 0) + 1, text, tone } }
}

/** Pins of sessions the page no longer lists go: kept or discarded here, or in another tab. */
function onPage(state: Sessions, page: PageView): Sessions {
  const open = new Set(page.sessions.map((session) => session.id))
  const pins: Partial<Record<SessionId, Pin>> = {}
  for (const pin of Object.values(state.pins)) {
    if (pin === undefined) continue
    if (open.has(pin.id)) pins[pin.id] = pin.joined ? pin : { ...pin, joined: true }
    else if (!pin.joined) pins[pin.id] = pin
  }
  const card = state.card !== null && pins[state.card] !== undefined ? state.card : null
  return { ...state, page, pins, card }
}

/** The open sessions that have a pin, in the page's order. */
export function pinned(state: Sessions): { pin: Pin; view: SessionView | null }[] {
  const views = new Map(state.page.sessions.map((view) => [view.id, view]))
  const listed = state.page.sessions.flatMap((view) => {
    const pin = state.pins[view.id]
    return pin === undefined ? [] : [{ pin, view }]
  })
  const waiting = Object.values(state.pins).flatMap((pin) =>
    pin === undefined || views.has(pin.id) ? [] : [{ pin, view: null }],
  )
  return [...listed, ...waiting].toSorted((a, b) => a.pin.n - b.pin.n)
}

export function stepSessions(state: Sessions, event: SessionEvent): Sessions {
  switch (event.kind) {
    case "page":
      return onPage(state, event.page)
    case "asked":
      return add(state, event.pin, false)
    case "rejoined":
      return event.pins.reduce(
        (next, pin) => (next.pins[pin.id] === undefined ? add(next, pin, true) : next),
        state,
      )
    case "refined": {
      const from = state.pins[event.from]
      if (from === undefined) return state
      const { [event.from]: _, ...rest } = state.pins
      return {
        ...state,
        pins: { ...rest, [event.id]: { ...from, id: event.id, joined: false, refine: "" } },
        card: state.card === event.from ? event.id : state.card,
      }
    }
    case "dropped": {
      const { [event.id]: _, ...pins } = state.pins
      return noticed(
        { ...state, pins, card: state.card === event.id ? null : state.card },
        event.text,
        "warn",
      )
    }
    case "card":
      return { ...state, card: event.id }
    case "cycled": {
      const order = pinned(state).map(({ pin }) => pin.id)
      if (order.length === 0) return state
      const at = state.card === null ? -1 : order.indexOf(state.card)
      const next =
        at === -1
          ? event.by === 1
            ? 0
            : order.length - 1
          : (at + event.by + order.length) % order.length
      return { ...state, card: order[next] ?? null }
    }
    case "refining":
      return edit(state, event.id, (pin) => ({ ...pin, refine: event.words }))
    case "measured":
      return edit(state, event.id, (pin) => ({ ...pin, baseline: event.baseline }))
    case "retargeted":
      return edit(state, event.id, (pin) => ({ ...pin, picked: event.picked }))
    case "notice":
      return noticed(state, event.text, event.tone)
    case "unnoticed":
      return state.notice?.key === event.key ? { ...state, notice: null } : state
  }
}

/** `v2` reads as B on the page. */
export const letterOf = (variant: VariantId) => ({ v1: "A", v2: "B", v3: "C" } as const)[variant]

const PHASE_DONE = {
  queued: 0.04,
  slot: 0.1,
  agent: 0.4,
  checks: 0.75,
  retry: 0.6,
  capture: 0.9,
} as const

/** How far a variant's job is, from its phase. */
export const doneOf = (variant: VariantView) =>
  variant.state === "pending" ? PHASE_DONE[variant.phase] : 1

export const isGenerating = (view: SessionView) =>
  view.variants.some((variant) => variant.state === "pending")

/** The mean of its variants' progress, for the pin's ring. */
export const progressOf = (view: SessionView) =>
  view.variants.reduce((sum, variant) => sum + doneOf(variant), 0) /
  Math.max(1, view.variants.length)

const PHASE_LABEL = {
  queued: "Queued",
  slot: "Starting",
  agent: "Writing",
  checks: "Checking",
  retry: "Fixing",
  capture: "Capturing",
} as const

export const phaseLabel = (phase: keyof typeof PHASE_LABEL) => PHASE_LABEL[phase]

/** What a session's chip and pin say about it, in a word or two. */
export function statusOf(view: SessionView | null): { label: string; tone: "plain" | "on" | Tone } {
  if (view === null) return { label: "starting", tone: "plain" }
  const { place } = view
  if (place.kind === "conflict") return { label: "conflict", tone: "warn" }
  if (place.kind === "waiting") return { label: `waits ${letterOf(place.variant)}`, tone: "warn" }
  if (place.kind === "shown") return { label: letterOf(place.variant), tone: "on" }
  const ready = view.variants.filter((variant) => variant.state === "ready").length
  if (isGenerating(view)) return { label: `${ready}/${view.variants.length}`, tone: "plain" }
  if (ready === 0) return { label: "failed", tone: "warn" }
  return { label: "original", tone: "plain" }
}

const baseName = (path: string) => path.split("/").at(-1) ?? path

/** `#1 Hero · hero.tsx` for each session holding what a waiting one wants. */
export function holdersOf(on: readonly Hold[], pins: Sessions["pins"]): string {
  return on
    .map((hold) => {
      const pin = pins[hold.session]
      const who = pin === undefined ? "another ask" : `#${pin.n} ${pin.name}`
      return `${who} · ${hold.files.map(baseName).join(", ")}`
    })
    .join("; ")
}

export const filesText = (files: readonly string[]) => files.map(baseName).join(", ")
