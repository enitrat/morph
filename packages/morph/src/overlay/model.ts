import { type BoxPlace, type Place } from "../inspector/label"
import { NO_SESSIONS, type SessionEvent, type Sessions, stepSessions } from "./sessions"

/** A point in document coordinates, so a mark stays on its spot while the page scrolls. */
export interface Spot {
  x: number
  y: number
}

/** A rectangle in document coordinates. */
export interface DocRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * A sketch mark as drawn, with the elements it snapped to. `snapped` names them as they were when
 * drawn: an arrow's whole move, else its element.
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

export type SketchTool = "box" | "arrow" | "note"

/** A dragged frame: where it is and the components fully inside it. */
export interface Frame {
  rect: DocRect
  items: readonly Element[]
  /** The one kind of component the designer narrowed the frame to. */
  narrow: string | null
}

export type Tab = "specs" | "tune"
export type Side = "left" | "right"

/** The inspector, floating on the side the selection leaves free. */
export type Sidebar = { kind: "closed" } | { kind: "open"; tab: Tab; side: Side; width: number }

/** What an ask is about. */
export type AskTarget = { kind: "element"; element: Element } | { kind: "frame"; frame: Frame }

export interface Draft {
  words: string
  marks: readonly Sketch[]
}

/** The selection is the ask being written: picking an element or a frame opens the composer on it. */
export type Composer = null | { target: AskTarget; draft: Draft; tool: SketchTool | null }

/** What is outlined under the pointer: a page hover, an inspector row, or a finding's instances. */
export type Hover =
  | null
  | { via: "page"; element: Element }
  | { via: "panel"; element: Element }
  | { via: "sheet"; elements: readonly Element[] }

export interface State {
  open: boolean
  hover: Hover
  composer: Composer
  /** The advanced inspector tabs the designer turned on. With none, there is no inspector. */
  tools: readonly Tab[]
  sidebar: Sidebar
  /** Variant sessions: the latest page view and each pin. They outlive closing the overlay. */
  sessions: Sessions
}

export const PANEL_WIDTH = 340
export const PANEL_NARROW = 280

export const initial: State = {
  open: false,
  hover: null,
  composer: null,
  tools: [],
  sidebar: { kind: "closed" },
  sessions: NO_SESSIONS,
}

export type Event =
  | { kind: "toggled" }
  | { kind: "hovered"; hover: Hover }
  /** The pointer left the page for Morph's own surfaces, which may already have set a hover. */
  | { kind: "pageLeft" }
  | { kind: "selected"; element: Element }
  | { kind: "framed"; frame: Frame }
  | { kind: "narrowed"; name: string | null }
  | { kind: "deselected" }
  | { kind: "tools"; tools: readonly Tab[] }
  | { kind: "inspector" }
  | { kind: "tabKey"; tab: Tab }
  | { kind: "tab"; tab: Tab }
  | { kind: "docked"; side: Side; width: number }
  | { kind: "typed"; words: string }
  | { kind: "tool"; tool: SketchTool | null }
  | { kind: "marked"; mark: Sketch }
  | { kind: "relabeled"; key: number; text: string }
  | { kind: "unmarked"; key: number }
  | { kind: "escape" }
  | SessionEvent

/** The element the composer is about, if it is about one element. */
export const selectedOf = ({ composer }: State): Element | null =>
  composer?.target.kind === "element" ? composer.target.element : null

const opened = (state: State, tab: Tab): Sidebar =>
  state.sidebar.kind === "open"
    ? { ...state.sidebar, tab }
    : { kind: "open", tab, side: "right", width: PANEL_WIDTH }

const withSessions = (state: State, event: SessionEvent): State => ({
  ...state,
  sessions: stepSessions(state.sessions, event),
})

/** Opens a fresh composer on what was picked, closing the open card. */
function picked(state: State, target: AskTarget): State {
  return {
    ...withSessions(state, { kind: "card", id: null }),
    composer: { target, draft: { words: "", marks: [] }, tool: null },
    hover: null,
  }
}

function editDraft(state: State, edit: (draft: Draft) => Draft): State {
  const { composer } = state
  return composer === null
    ? state
    : { ...state, composer: { ...composer, draft: edit(composer.draft) } }
}

const sameHover = (a: Hover, b: Hover) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.via === b.via &&
    ("element" in a
      ? "element" in b && a.element === b.element
      : "elements" in b && a.elements === b.elements))

/** Esc backs out one layer: tool, narrowing, composer, card, then the inspector. */
function escape(state: State): State {
  const { composer, sidebar } = state
  if (composer?.tool) return { ...state, composer: { ...composer, tool: null } }
  if (composer?.target.kind === "frame" && composer.target.frame.narrow !== null)
    return {
      ...state,
      composer: {
        ...composer,
        target: { kind: "frame", frame: { ...composer.target.frame, narrow: null } },
      },
    }
  if (composer !== null) return { ...state, composer: null }
  if (state.sessions.card !== null) return withSessions(state, { kind: "card", id: null })
  if (sidebar.kind === "open") return { ...state, sidebar: { kind: "closed" }, hover: null }
  return state
}

/** Opens or closes the inspector on a tab, if that tab is turned on. */
function toggledTab(state: State, tab: Tab): State {
  if (!state.tools.includes(tab)) return state
  return state.sidebar.kind === "open" && state.sidebar.tab === tab
    ? { ...state, sidebar: { kind: "closed" }, hover: null }
    : { ...state, sidebar: opened(state, tab) }
}

function step(state: State, event: Event): State {
  switch (event.kind) {
    case "toggled":
      return {
        ...initial,
        open: !state.open,
        tools: state.tools,
        sessions: { ...state.sessions, card: null },
      }
    case "hovered":
      return sameHover(state.hover, event.hover) ? state : { ...state, hover: event.hover }
    case "pageLeft":
      return state.hover?.via === "page" ? { ...state, hover: null } : state
    case "selected":
      return picked(state, { kind: "element", element: event.element })
    case "framed":
      return picked(state, { kind: "frame", frame: event.frame })
    case "narrowed": {
      const { composer } = state
      if (composer?.target.kind !== "frame") return state
      const { frame } = composer.target
      const narrow = frame.narrow === event.name ? null : event.name
      return {
        ...state,
        composer: { ...composer, target: { kind: "frame", frame: { ...frame, narrow } } },
      }
    }
    case "deselected":
      return { ...state, composer: null }
    case "tools": {
      const { sidebar } = state
      const first = event.tools[0]
      const next: Sidebar =
        sidebar.kind !== "open" || event.tools.includes(sidebar.tab)
          ? sidebar
          : first === undefined
            ? { kind: "closed" }
            : { ...sidebar, tab: first }
      return { ...state, tools: event.tools, sidebar: next }
    }
    case "inspector": {
      const [first] = state.tools
      if (state.sidebar.kind === "open")
        return { ...state, sidebar: { kind: "closed" }, hover: null }
      return first === undefined ? state : { ...state, sidebar: opened(state, first) }
    }
    case "tabKey":
      return toggledTab(state, event.tab)
    case "tab":
      return state.tools.includes(event.tab)
        ? { ...state, sidebar: opened(state, event.tab) }
        : state
    case "docked":
      return state.sidebar.kind === "open"
        ? { ...state, sidebar: { ...state.sidebar, side: event.side, width: event.width } }
        : state
    case "typed":
      return editDraft(state, (draft) => ({ ...draft, words: event.words }))
    case "tool":
      return state.composer === null
        ? state
        : { ...state, composer: { ...state.composer, tool: event.tool } }
    case "marked":
      return editDraft(state, (draft) => ({ ...draft, marks: [...draft.marks, event.mark] }))
    case "relabeled":
      return editDraft(state, (draft) => ({
        ...draft,
        marks: draft.marks.map((mark) =>
          mark.key !== event.key || mark.kind === "arrow"
            ? mark
            : mark.kind === "box"
              ? { ...mark, label: event.text }
              : { ...mark, text: event.text },
        ),
      }))
    case "unmarked":
      return editDraft(state, (draft) => ({
        ...draft,
        marks: draft.marks.filter((mark) => mark.key !== event.key),
      }))
    case "escape":
      return escape(state)
    case "asked":
      // The designer goes on to the next component while this one generates.
      return { ...withSessions(state, event), composer: null }
    case "card":
    case "cycled": {
      const next = withSessions(state, event)
      return next.sessions.card === null ? next : { ...next, composer: null }
    }
    default:
      return withSessions(state, event)
  }
}

/** Session events from polls and answers land while the overlay is closed too. */
const ANY_TIME = new Set<Event["kind"]>([
  "toggled",
  "tools",
  "page",
  "answered",
  "locating",
  "sending",
  "uncertain",
  "refused",
  "reference-saved",
  "retargeted",
  "located",
  "notice",
  "unnoticed",
])

export function reduce(state: State, event: Event): State {
  if (!state.open && !ANY_TIME.has(event.kind)) return state
  return step(state, event)
}
