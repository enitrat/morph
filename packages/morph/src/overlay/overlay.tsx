import { MotionConfig } from "motion/react"
import { type Dispatch, useEffect, useEffectEvent, useReducer, useRef, useState } from "react"

import { type ThemeName } from "../core/config"
import { isPointShortcut, isTyping } from "../inspector/pointer"
import { isMorph } from "../inspector/target"
import { type SessionActions } from "./ask"
import { itemsIn } from "./frame"
import { readSessions } from "./session-store"
import { useSessions } from "./live"
import { type Event, initial, reduce, type State, type Tab } from "./model"
import { type Box, boxOf, dockFor, uncovered } from "./place"
import { loadScales, NO_SCALES, type Scales } from "./scale"
import { Marks, SketchLayer } from "./sketch"
import { OVERLAY_CSS } from "./styles"
import { useHostTheme } from "./theme"
import { firstChildOf, parentOf, pickAt, siblingOf } from "./tree"
import { Composer } from "./ui/Composer"
import { UI_CSS } from "./ui/css"
import { Dock, Notice } from "./ui/Dock"
import { fileOf, useSettled, useSource, useTick } from "./ui/hooks"
import { Inspector } from "./ui/Inspector"
import { frameBox, PageLayer } from "./ui/PageLayer"
import { boxOfPin, flipOf, Pins } from "./ui/Pins"

/** Pointer travel before a press on the page becomes a frame drag. */
const DRAG_PX = 5
/** How long a page hover holds before Specs previews it, so crossing other elements does not flicker. */
const PREVIEW_MS = 90
const TAB_KEYS: Partial<Record<string, Tab>> = { s: "specs", t: "morph" }

const viewport = () => ({ width: innerWidth, height: innerHeight })

const boxBetween = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
})

/**
 * What the inspector keeps clear: the selection, else the frame, else what the composer or the
 * open thread card is about.
 */
function focusBox(state: State): Box | null {
  const { selection, composer, sessions } = state
  if (selection.kind === "element")
    return selection.element.isConnected ? boxOf(selection.element.getBoundingClientRect()) : null
  if (selection.kind === "frame") return frameBox(selection.frame)
  if (composer?.target.kind === "element")
    return boxOf(composer.target.element.getBoundingClientRect())
  const pin = sessions.card === null ? undefined : sessions.pins[sessions.card]
  return pin === undefined ? null : boxOfPin(pin)
}

/** Re-docks the open inspector as the selection or the viewport moves. */
function useDocking(state: State, dispatch: Dispatch<Event>) {
  const docked = useEffectEvent(() => {
    const { sidebar } = state
    if (sidebar.kind !== "open") return
    const next = dockFor(focusBox(state), viewport(), sidebar.side)
    if (next.side !== sidebar.side || next.width !== sidebar.width)
      dispatch({ kind: "docked", ...next })
  })
  const open = state.sidebar.kind === "open"
  useEffect(() => {
    if (!open) return undefined
    let raf = 0
    const tick = () => {
      docked()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [open])
}

type Drag = { from: { x: number; y: number }; to: { x: number; y: number }; moved: boolean }

/** Hover, click to select and drag to frame on the page, with the page's own clicks held back. */
function usePagePointer(state: State, dispatch: Dispatch<Event>) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragging = useRef<Drag | null>(null)
  const paged = useRef<Element | null>(null)

  const onMove = useEffectEvent((event: PointerEvent) => {
    const at = { x: event.clientX, y: event.clientY }
    const now = dragging.current
    if (now !== null) {
      const next = {
        ...now,
        to: at,
        moved: now.moved || Math.hypot(at.x - now.from.x, at.y - now.from.y) > DRAG_PX,
      }
      dragging.current = next
      setDrag(next)
      return
    }
    // Compared against what this handler last sent, not the rendered state, which lags a move behind.
    if (isMorph(event.target as Element)) {
      if (paged.current !== null) dispatch({ kind: "pageLeft" })
      paged.current = null
      return
    }
    const element = pickAt(at.x, at.y)
    if (element !== paged.current)
      dispatch({ kind: "hovered", hover: element && { via: "page", element } })
    paged.current = element
  })
  const onDown = useEffectEvent((event: PointerEvent) => {
    if (isMorph(event.target as Element) || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const active = document.activeElement
    if (active instanceof HTMLElement && isMorph(active)) active.blur()
    const at = { x: event.clientX, y: event.clientY }
    dragging.current = { from: at, to: at, moved: false }
  })
  const onUp = useEffectEvent((event: PointerEvent) => {
    const done = dragging.current
    if (done === null) return
    dragging.current = null
    setDrag(null)
    event.preventDefault()
    event.stopPropagation()
    if (done.moved) {
      const box = boxBetween(done.from, done.to)
      const items = itemsIn(box)
      if (items.length === 0) dispatch({ kind: "deselected" })
      else
        dispatch({
          kind: "framed",
          frame: {
            rect: {
              left: box.left + scrollX,
              top: box.top + scrollY,
              width: box.right - box.left,
              height: box.bottom - box.top,
            },
            items,
            narrow: null,
          },
        })
      return
    }
    const element = pickAt(event.clientX, event.clientY)
    dispatch(element ? { kind: "selected", element } : { kind: "deselected" })
  })

  const open = state.open
  const sketching = state.composer?.tool != null
  useEffect(() => {
    if (!open || sketching) return undefined
    const move = (event: PointerEvent) => {
      onMove(event)
    }
    const down = (event: PointerEvent) => {
      onDown(event)
    }
    const up = (event: PointerEvent) => {
      onUp(event)
    }
    // The page never sees a click while Morph is pointing at it.
    const block = (event: MouseEvent) => {
      if (!isMorph(event.target as Element)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerdown", down, true)
    window.addEventListener("pointerup", up, true)
    for (const kind of ["click", "mousedown", "mouseup", "dblclick", "auxclick"])
      window.addEventListener(kind, block as EventListener, true)
    return () => {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointerup", up, true)
      for (const kind of ["click", "mousedown", "mouseup", "dblclick", "auxclick"])
        window.removeEventListener(kind, block as EventListener, true)
      dragging.current = null
      setDrag(null)
    }
  }, [open, sketching])

  const box = drag?.moved ? boxBetween(drag.from, drag.to) : null
  return box
}

/**
 * Alt+Shift+R opens and closes; S, T and \ drive the inspector; A asks, K sketches; ⇧↵ and ↵
 * climb, ⇥ moves to the next sibling; [ and ] step through pins, 0–3 and ←/→ flip the open card's variants; Esc backs out.
 */
function useKeys(state: State, dispatch: Dispatch<Event>, actions: SessionActions) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (isPointShortcut(event)) {
      event.preventDefault()
      dispatch({ kind: "toggled" })
      return
    }
    if (!state.open) return
    if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
    const handled = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    const key = event.key.toLowerCase()
    const { selection, composer } = state
    if (event.key === "Escape") {
      handled()
      dispatch({ kind: "escape" })
      return
    }
    if (event.key === "\\") {
      handled()
      dispatch({ kind: "inspector" })
      return
    }
    const tab = TAB_KEYS[key]
    if (tab !== undefined && !event.shiftKey) {
      handled()
      dispatch({ kind: "tabKey", tab })
      return
    }
    if (composer !== null) return
    if ((key === "[" || key === "]") && Object.keys(state.sessions.pins).length > 0) {
      handled()
      dispatch({ kind: "cycled", by: key === "]" ? 1 : -1 })
      return
    }
    const card = state.sessions.card
    const view = state.sessions.page.sessions.find((session) => session.thread === card)
    const flip =
      view === undefined || (card !== null && state.sessions.pins[card]?.submission !== null)
        ? null
        : flipOf(view, key)
    if (view !== undefined && flip !== null) {
      handled()
      if (flip.kind === "show") actions.show(view.id, flip.choice)
      else dispatch({ kind: "notice", text: flip.text, tone: "info" })
      return
    }
    if (selection.kind === "frame" && key === "a") {
      handled()
      dispatch({
        kind: "ask",
        target: { kind: "frame", frame: selection.frame },
        words: "",
        tool: null,
      })
      return
    }
    if (selection.kind !== "element") return
    const { element } = selection
    if (key === "a" || key === "k") {
      handled()
      dispatch({
        kind: "ask",
        target: { kind: "element", element },
        words: "",
        tool: key === "k" ? "box" : null,
      })
      return
    }
    const next =
      event.key === "Enter"
        ? event.shiftKey
          ? parentOf(element)
          : firstChildOf(element)
        : event.key === "Tab"
          ? siblingOf(element, event.shiftKey ? -1 : 1)
          : undefined
    if (next === undefined) return
    handled()
    if (next !== null) dispatch({ kind: "selected", element: next })
  })
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      onKey(event)
    }
    window.addEventListener("keydown", down, true)
    return () => {
      window.removeEventListener("keydown", down, true)
    }
  }, [])
}

function useScales(open: boolean, theme: ThemeName | null): Scales {
  const [scales, setScales] = useState(NO_SCALES)
  useEffect(() => {
    if (!open || theme === null) return undefined
    let live = true
    void loadScales(theme).then((loaded) => {
      if (live) setScales(loaded)
    })
    return () => {
      live = false
    }
  }, [open, theme])
  return scales
}

/** Morph on the page: select, frame, ask, and flip between variants. */
export function Overlay() {
  const [state, dispatch] = useReducer(reduce, initial, (state) => ({
    ...state,
    sessions: readSessions(),
  }))
  const theme = useHostTheme(state.open)
  const scales = useScales(state.open, theme?.name ?? null)
  const drag = usePagePointer(state, dispatch)
  const actions = useSessions(state, dispatch)
  useKeys(state, dispatch, actions)
  useDocking(state, dispatch)

  const { selection, composer, sidebar, hover } = state
  const selected = selection.kind === "element" ? selection.element : null
  // A frame's sheet stays up while the pointer crosses the page, as the prototype's frame did.
  const hovered = hover?.via === "page" && selection.kind !== "frame" ? hover.element : null
  useTick([
    selected,
    hover?.via === "sheet" ? null : (hover?.element ?? null),
    composer?.target.kind === "element" ? composer.target.element : null,
  ])
  const preview = useSettled(
    sidebar.kind === "open" && sidebar.tab === "specs" ? hovered : null,
    PREVIEW_MS,
  )
  const source = useSource(selected)
  const live = drag ? itemsIn(drag, 40) : []
  const dock = sidebar.kind === "open" ? { side: sidebar.side, width: sidebar.width } : null
  const area = uncovered(dock, viewport())

  return (
    <div className="ui">
      {/* First, so its `@layer` statement orders the legacy layer after the base reset. */}
      <style>{UI_CSS}</style>
      <style>{`@layer legacy {${OVERLAY_CSS}}`}</style>
      <MotionConfig reducedMotion="user">
        {state.open && (
          <>
            <PageLayer
              state={state}
              drag={drag}
              live={live}
              source={source && fileOf(source)}
              dispatch={dispatch}
            />
            <Pins state={state} area={area} actions={actions} dispatch={dispatch} />
            {composer && <Marks marks={composer.draft.marks} dispatch={dispatch} />}
            {composer?.tool && (
              <SketchLayer key={composer.tool} tool={composer.tool} dispatch={dispatch} />
            )}
            {composer && (
              <Composer composer={composer} area={area} actions={actions} dispatch={dispatch} />
            )}
          </>
        )}
        <Inspector
          state={state}
          preview={preview}
          scales={scales}
          theme={theme}
          dispatch={dispatch}
        />
        <Notice state={state} center={(area.left + area.right) / 2} />
        <Dock state={state} center={(area.left + area.right) / 2} dispatch={dispatch} />
      </MotionConfig>
    </div>
  )
}
