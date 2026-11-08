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

export type Selection =
  | { kind: "none" }
  | { kind: "element"; element: Element }
  | { kind: "frame"; frame: Frame }

/** The measuring lens: off, on while ⌥ is held, or latched on with I. */
export type Lens = "off" | "held" | "latched"

export type Tab = "specs" | "tune" | "layers"
export type Side = "left" | "right"

/**
 * The inspector. `auto` marks one a frame opened, which closes again with the frame unless the
 * designer took it over.
 */
export type Sidebar =
  | { kind: "closed" }
  | { kind: "open"; tab: Tab; side: Side; width: number; auto: boolean }

/** What an ask is about. */
export type AskTarget = { kind: "element"; element: Element } | { kind: "frame"; frame: Frame }

export interface Draft {
  words: string
  marks: readonly Sketch[]
}

export type Composer = null | { target: AskTarget; draft: Draft; tool: SketchTool | null }

/** What is outlined under the pointer: a page hover, a Layers row, or a finding's instances. */
export type Hover =
  | null
  | { via: "page"; element: Element }
  | { via: "layers"; element: Element }
  | { via: "sheet"; elements: readonly Element[] }

export interface State {
  open: boolean
  hover: Hover
  selection: Selection
  lens: Lens
  sidebar: Sidebar
  composer: Composer
  /** Variant sessions: the latest page view and each pin. They outlive closing the overlay. */
  sessions: Sessions
}

export const PANEL_WIDTH = 340
export const PANEL_NARROW = 280

export const initial: State = {
  open: false,
  hover: null,
  selection: { kind: "none" },
  lens: "off",
  sidebar: { kind: "closed" },
  composer: null,
  sessions: NO_SESSIONS,
}

export type Event =
  | { kind: "toggled" }
  | { kind: "hovered"; hover: Hover }
  /** The pointer left the page for Tune's own surfaces, which may already have set a hover. */
  | { kind: "pageLeft" }
  | { kind: "selected"; element: Element }
  | { kind: "framed"; frame: Frame }
  | { kind: "narrowed"; name: string | null }
  | { kind: "deselected" }
  | { kind: "alt"; down: boolean }
  | { kind: "latched" }
  | { kind: "inspector" }
  | { kind: "tabKey"; tab: Tab }
  | { kind: "tab"; tab: Tab }
  | { kind: "docked"; side: Side; width: number }
  | { kind: "ask"; target: AskTarget; words: string; tool: SketchTool | null }
  | { kind: "typed"; words: string }
  | { kind: "tool"; tool: SketchTool | null }
  | { kind: "marked"; mark: Sketch }
  | { kind: "relabeled"; key: number; text: string }
  | { kind: "unmarked"; key: number }
  | { kind: "escape" }
  | SessionEvent

const opened = (state: State, tab: Tab, auto = false): Sidebar =>
  state.sidebar.kind === "open"
    ? { ...state.sidebar, tab, auto }
    : { kind: "open", tab, side: "right", width: PANEL_WIDTH, auto }

/** A frame's auto-opened inspector goes with the frame. */
function withoutFrame(state: State): State {
  const sidebar: Sidebar =
    state.sidebar.kind === "open" && state.sidebar.auto ? { kind: "closed" } : state.sidebar
  return { ...state, selection: { kind: "none" }, sidebar }
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

const withSessions = (state: State, event: SessionEvent): State => ({
  ...state,
  sessions: stepSessions(state.sessions, event),
})

/** Esc backs out one layer: tool, composer, card, selection, narrowing, frame, then the inspector. */
function escape(state: State): State {
  const { composer, selection, sidebar } = state
  if (composer?.tool) return { ...state, composer: { ...composer, tool: null } }
  if (composer !== null) return { ...state, composer: null }
  if (state.sessions.card !== null) return withSessions(state, { kind: "card", id: null })
  if (state.lens === "latched") return { ...state, lens: "off" }
  if (selection.kind === "element") return { ...state, selection: { kind: "none" } }
  if (selection.kind === "frame" && selection.frame.narrow !== null)
    return { ...state, selection: { kind: "frame", frame: { ...selection.frame, narrow: null } } }
  if (selection.kind === "frame") return withoutFrame(state)
  if (sidebar.kind === "open") return { ...state, sidebar: { kind: "closed" }, hover: null }
  return state
}

function step(state: State, event: Event): State {
  switch (event.kind) {
    case "toggled":
      return { ...initial, open: !state.open, sessions: { ...state.sessions, card: null } }
    case "hovered":
      return sameHover(state.hover, event.hover) ? state : { ...state, hover: event.hover }
    case "pageLeft":
      return state.hover?.via === "page" ? { ...state, hover: null } : state
    case "selected":
      // Picking from a frame keeps the inspector it opened: the designer is reading there.
      return {
        ...withSessions(state, { kind: "card", id: null }),
        selection: { kind: "element", element: event.element },
        sidebar: state.sidebar.kind === "open" ? { ...state.sidebar, auto: false } : state.sidebar,
        composer: null,
        hover: null,
      }
    case "framed":
      return {
        ...state,
        selection: { kind: "frame", frame: event.frame },
        composer: null,
        // The frame's read-out lives in the inspector, so a frame opens it on Specs.
        sidebar:
          state.sidebar.kind === "open"
            ? { ...state.sidebar, tab: "specs" }
            : opened(state, "specs", true),
      }
    case "narrowed": {
      const { selection } = state
      if (selection.kind !== "frame") return state
      const narrow = selection.frame.narrow === event.name ? null : event.name
      return { ...state, selection: { kind: "frame", frame: { ...selection.frame, narrow } } }
    }
    case "deselected":
      return {
        ...(state.selection.kind === "frame" ? withoutFrame(state) : state),
        selection: { kind: "none" },
        composer: null,
      }
    case "alt":
      if (event.down) return state.lens === "off" ? { ...state, lens: "held" } : state
      return state.lens === "held" ? { ...state, lens: "off" } : state
    case "latched":
      return { ...state, lens: state.lens === "latched" ? "off" : "latched" }
    case "inspector":
      return state.sidebar.kind === "open"
        ? { ...state, sidebar: { kind: "closed" }, hover: null }
        : { ...state, sidebar: opened(state, "specs") }
    case "tabKey":
      return state.sidebar.kind === "open" && state.sidebar.tab === event.tab
        ? { ...state, sidebar: { kind: "closed" }, hover: null }
        : { ...state, sidebar: opened(state, event.tab) }
    case "tab":
      return { ...state, sidebar: opened(state, event.tab) }
    case "docked":
      return state.sidebar.kind === "open"
        ? { ...state, sidebar: { ...state.sidebar, side: event.side, width: event.width } }
        : state
    case "ask":
      return {
        ...state,
        composer: {
          target: event.target,
          draft: { words: event.words, marks: [] },
          tool: event.tool,
        },
      }
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
      // The designer goes on to the next component while this one generates. Locating the
      // target takes a moment, so one already picked meanwhile stays picked.
      return state.composer === null
        ? withSessions(state, event)
        : { ...withSessions(state, event), composer: null, selection: { kind: "none" } }
    case "card":
    case "cycled": {
      const next = withSessions(state, event)
      return next.sessions.card === null
        ? next
        : { ...next, composer: null, selection: { kind: "none" } }
    }
    default:
      return withSessions(state, event)
  }
}

/** Session events from polls and answers land while the overlay is closed too. */
const ANY_TIME = new Set<Event["kind"]>([
  "toggled",
  "page",
  "rejoined",
  "refined",
  "dropped",
  "measured",
  "retargeted",
  "notice",
  "unnoticed",
])

export function reduce(state: State, event: Event): State {
  if (!state.open && !ANY_TIME.has(event.kind)) return state
  return step(state, event)
}
