import {
  type Hold,
  Observation,
  type PageView,
  type SessionId,
  type SessionView,
  ThreadId,
  threadOf,
  type VariantId,
  type VariantView,
} from "../variant/model"
import { type PinnedTarget, type TargetMatch, type ReferenceMeasurement } from "./pinned-targets"
import { type SubmissionCommand, commandId, commandWords } from "./submission"

export type Submission =
  | { kind: "locating"; id: SessionId; words: string; from: SessionId | null }
  | { kind: "sending"; command: SubmissionCommand }
  | { kind: "uncertain"; command: SubmissionCommand; detail: string }

/** Browser presentation and target references belong to a thread across all its rounds. */
export interface Pin {
  id: ThreadId
  n: number
  name: string
  words: string
  file: string | null
  targets: readonly PinnedTarget[]
  refine: string
  submission: Submission | null
}

export type Tone = "info" | "warn"
export interface Notice {
  key: number
  text: string
  tone: Tone
}
export interface Sessions {
  page: PageView
  pins: Readonly<Partial<Record<ThreadId, Pin>>>
  card: ThreadId | null
  notice: Notice | null
  numbered: number
  asked: boolean
}
export const NO_SESSIONS: Sessions = {
  page: { observation: Observation.parse(0), sessions: [], stuck: [] },
  pins: {},
  card: null,
  notice: null,
  numbered: 0,
  asked: false,
}

/** Local metadata captured before the first request is located. */
export interface NewPin {
  id: SessionId
  n: number | null
  name: string
  words: string
  file: string | null
  targets: readonly PinnedTarget[]
}

export type SessionEvent =
  | { kind: "page"; page: PageView }
  | { kind: "answered"; thread: ThreadId; id: SessionId; page: PageView }
  | { kind: "asked"; pin: NewPin }
  | { kind: "locating"; thread: ThreadId; id: SessionId; from: SessionId; words: string }
  | { kind: "sending"; thread: ThreadId; command: SubmissionCommand }
  | { kind: "uncertain"; thread: ThreadId; command: SubmissionCommand; detail: string }
  | { kind: "refused"; thread: ThreadId; id: SessionId; text: string }
  | { kind: "card"; id: ThreadId | null }
  | { kind: "cycled"; by: 1 | -1 }
  | { kind: "refining"; id: ThreadId; words: string }
  | {
      kind: "reference-saved"
      thread: ThreadId
      slot: number
      element: Element
      reference: ReferenceMeasurement
    }
  | { kind: "retargeted"; id: ThreadId; matches: readonly TargetMatch[] }
  | { kind: "located"; thread: ThreadId; id: SessionId; file: string }
  | { kind: "notice"; text: string; tone: Tone }
  | { kind: "unnoticed"; key: number }

export const submissionId = (submission: Submission) =>
  submission.kind === "locating" ? submission.id : commandId(submission.command)
export const submissionWords = (submission: Submission) =>
  submission.kind === "locating" ? submission.words : commandWords(submission.command)

/** A visible successor proves acceptance or supersession; absence never proves rejection. */
export function observed(page: PageView, thread: ThreadId, submission: Submission): boolean {
  const view = page.sessions.find((view) => view.thread === thread)
  if (view === undefined) return false
  const from =
    submission.kind === "locating"
      ? submission.from
      : submission.command.op === "refine"
        ? submission.command.request.from
        : null
  return from === null || view.id !== from
}

function edit(state: Sessions, id: ThreadId, change: (pin: Pin) => Pin): Sessions {
  const pin = state.pins[id]
  return pin === undefined ? state : { ...state, pins: { ...state.pins, [id]: change(pin) } }
}
function noticed(state: Sessions, text: string, tone: Tone): Sessions {
  return { ...state, notice: { key: (state.notice?.key ?? 0) + 1, text, tone } }
}

function onPage(state: Sessions, page: PageView): Sessions {
  const pins: Partial<Record<ThreadId, Pin>> = {}
  let numbered = state.numbered
  for (const view of page.sessions) {
    const existing = state.pins[view.thread]
    const target = view.targets[0]
    const previous = state.page.sessions.find((entry) => entry.thread === view.thread)
    const pin: Pin = existing ?? {
      id: view.thread,
      n: ++numbered,
      name: target?.owner.at(-1) ?? target?.source.path.split("/").at(-1) ?? "Ask",
      words: view.words,
      file: target?.source.path.split("/").at(-1) ?? null,
      targets: [],
      refine: "",
      submission: null,
    }
    const changed = previous !== undefined && previous.id !== view.id
    pins[view.thread] = {
      ...pin,
      refine: changed ? "" : pin.refine,
      submission:
        pin.submission !== null && observed(page, view.thread, pin.submission)
          ? null
          : pin.submission,
    }
  }
  for (const pin of Object.values(state.pins))
    if (pin !== undefined && pin.submission !== null && pins[pin.id] === undefined)
      pins[pin.id] = pin
  const card = state.card !== null && pins[state.card] !== undefined ? state.card : null
  return { ...state, page, pins, numbered, card }
}

/** Current observed threads plus unresolved local submissions, in pin-number order. */
export function pinned(state: Sessions): { pin: Pin; view: SessionView | null }[] {
  const views = new Map(state.page.sessions.map((view) => [view.thread, view]))
  return Object.values(state.pins)
    .flatMap((pin) => (pin === undefined ? [] : [{ pin, view: views.get(pin.id) ?? null }]))
    .toSorted((a, b) => a.pin.n - b.pin.n)
}

export function stepSessions(state: Sessions, event: SessionEvent): Sessions {
  switch (event.kind) {
    case "page":
      return event.page.observation <= state.page.observation ? state : onPage(state, event.page)
    case "answered": {
      const next = edit(state, event.thread, (pin) =>
        pin.submission !== null && submissionId(pin.submission) === event.id
          ? { ...pin, submission: null }
          : pin,
      )
      return onPage(next, event.page.observation > state.page.observation ? event.page : state.page)
    }
    case "asked": {
      const id = threadOf(event.pin.id, null)
      const n = event.pin.n ?? state.numbered + 1
      const pin: Pin = {
        ...event.pin,
        id,
        n,
        refine: "",
        submission: { kind: "locating", id: event.pin.id, words: event.pin.words, from: null },
      }
      return {
        ...state,
        pins: { ...state.pins, [id]: pin },
        numbered: Math.max(state.numbered, n),
        card: state.asked ? state.card : id,
        asked: true,
      }
    }
    case "locating":
      return edit(state, event.thread, (pin) =>
        pin.submission !== null
          ? pin
          : {
              ...pin,
              submission: { kind: "locating", id: event.id, words: event.words, from: event.from },
            },
      )
    case "sending":
      return edit(state, event.thread, (pin) =>
        pin.submission !== null && submissionId(pin.submission) === commandId(event.command)
          ? { ...pin, submission: { kind: "sending", command: event.command } }
          : pin,
      )
    case "uncertain":
      return edit(state, event.thread, (pin) =>
        pin.submission !== null && submissionId(pin.submission) === commandId(event.command)
          ? {
              ...pin,
              submission: { kind: "uncertain", command: event.command, detail: event.detail },
            }
          : pin,
      )
    case "refused": {
      const pin = state.pins[event.thread]
      if (pin?.submission == null || submissionId(pin.submission) !== event.id) return state
      return noticed(
        onPage(
          edit(state, event.thread, (pin) => ({ ...pin, submission: null })),
          state.page,
        ),
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
    case "reference-saved":
      return edit(state, event.thread, (pin) => ({
        ...pin,
        targets: pin.targets.map((target, slot) =>
          slot === event.slot &&
          target.match.kind !== "missing" &&
          target.match.element === event.element &&
          event.element.isConnected
            ? { ...target, reference: event.reference }
            : target,
        ),
      }))
    case "located":
      return edit(state, event.thread, (pin) =>
        pin.submission !== null && submissionId(pin.submission) === event.id
          ? { ...pin, file: event.file }
          : pin,
      )
    case "retargeted":
      return edit(state, event.id, (pin) => ({
        ...pin,
        targets: pin.targets.map((target, slot) => ({
          ...target,
          match: event.matches[slot] ?? target.match,
        })),
      }))
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
  view.kind === "planning" ||
  (view.kind === "active" && view.variants.some((variant) => variant.state === "pending"))

/** The mean of its variants' progress, for the pin's ring. */
export const progressOf = (view: SessionView) =>
  view.kind !== "active"
    ? view.kind === "planning"
      ? 0.02
      : 1
    : view.variants.reduce((sum, variant) => sum + doneOf(variant), 0) /
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
export function statusOf(
  view: SessionView | null,
  submission: Submission | null = null,
): { label: string; tone: "plain" | "on" | Tone } {
  if (submission !== null)
    return {
      label:
        submission.kind === "uncertain"
          ? "unconfirmed"
          : submission.kind === "locating"
            ? "locating"
            : "sending",
      tone: submission.kind === "uncertain" ? "warn" : "plain",
    }
  if (view === null) return { label: "reconnecting", tone: "plain" }
  if (view.kind === "planning") return { label: "planning", tone: "plain" }
  if (view.kind === "plan-failed") return { label: "planning failed", tone: "warn" }
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
export function holdersOf(on: readonly Hold[], sessions: Sessions): string {
  return on
    .map((hold) => {
      const view = sessions.page.sessions.find((view) => view.id === hold.session)
      const pin = view === undefined ? undefined : sessions.pins[view.thread]
      const who = pin === undefined ? "another ask" : `#${pin.n} ${pin.name}`
      return `${who} · ${hold.files.map(baseName).join(", ")}`
    })
    .join("; ")
}

export const filesText = (files: readonly string[]) => files.map(baseName).join(", ")
