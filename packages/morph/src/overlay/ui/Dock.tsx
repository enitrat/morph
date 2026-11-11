// Adapted from Detent's MorphingDock (MIT, see LICENSE): one surface that morphs between the
// launcher and the session bar on the dock's spring, with the shared plate under the active tool.
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type Dispatch, type ReactNode, useEffect, useRef, useState } from "react"

import { type Event, type State, type Tab } from "../model"
import { isGenerating, pinned, statusOf } from "../sessions"
import { Glyph, type GlyphName } from "./Glyph"
import { useGlass } from "./glass"
import { Kbd } from "./Kbd"
import { dur, ease, spring } from "./lib/motion"
import { Disc } from "./Pins"

/** One chip per session: its number, name, and where it stands. A click opens its card. */
function Chips({ state, dispatch }: { state: State; dispatch: Dispatch<Event> }) {
  const list = pinned(state.sessions)
  if (list.length === 0) return null
  return (
    <span className="flex items-center gap-0.5">
      {list.map(({ pin, view }) => {
        const status = statusOf(view, pin.submission)
        const on = state.sessions.card === pin.id
        return (
          <button
            key={pin.n}
            type="button"
            aria-pressed={on}
            title={`${pin.name} · ${status.label}  [ ]`}
            onClick={() => {
              dispatch({ kind: "card", id: on ? null : pin.id })
            }}
            className={`ring-focus flex h-(--ctrl) items-center gap-1.5 rounded-full pr-(--inset) pl-1.5 text-sm transition-colors duration-150 ${
              on ? "bg-surface-2 shadow-[inset_0_0_0_1px_var(--ring)]" : "hover:bg-surface-2"
            }`}
          >
            <Disc pin={pin} view={view} size={22} />
            <span className="max-w-24 truncate font-medium text-ink">{pin.name}</span>
            <span
              className={`font-mono text-sm ${
                status.tone === "on"
                  ? "text-accent"
                  : status.tone === "warn"
                    ? "text-warn"
                    : "text-ink-3"
              }`}
            >
              {status.label}
            </span>
          </button>
        )
      })}
    </span>
  )
}

/** A short line above the bar: what an operation did, or why the bridge refused it. */
export function Notice({ state, center }: { state: State; center: number }) {
  const { notice } = state.sessions
  const reduce = useReducedMotion()
  return (
    <div
      className="pointer-events-none fixed bottom-[68px] z-[2147483645] flex w-0 justify-center"
      style={{ left: state.open ? center : innerWidth - 80 }}
    >
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.key}
            role="status"
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: dur.enter, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: dur.exit } }}
            className={`glass flex min-h-(--ctrl) w-max max-w-[520px] flex-none items-center gap-2 rounded-(--r-ctrl) px-(--inset) py-2 ${
              notice.tone === "warn" ? "text-warn" : "text-ink"
            }`}
          >
            <Glyph name={notice.tone === "warn" ? "warn" : "check"} size={13} />
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Hint({ state }: { state: State }) {
  const k = (key: string) => <Kbd>{key}</Kbd>
  const parts: ReactNode[] = state.composer?.tool
    ? [<span key="d">Drag on the page to draw</span>, <span key="e">{k("esc")} done</span>]
    : state.sessions.card !== null
      ? [
          <span key="f">
            {k("0")}–{k("3")} flip
          </span>,
          <span key="p">
            {k("[")}
            {k("]")} pins
          </span>,
        ]
      : state.composer?.target.kind === "element"
        ? [
            <span key="p">{k("⌥↑")} parent</span>,
            <span key="c">{k("⌥↓")} child</span>,
            <span key="e">{k("esc")} clear</span>,
          ]
        : state.composer?.target.kind === "frame"
          ? [<span key="l">Click a label to pick one</span>, <span key="e">{k("esc")} clear</span>]
          : [<span key="c">Click to select</span>, <span key="d">Drag to frame</span>]
  return (
    <span className="flex items-center gap-(--inset) px-1 text-sm whitespace-nowrap text-ink-2">
      {parts}
    </span>
  )
}

function Tool({
  glyph,
  label,
  shortcut,
  on,
  onClick,
}: {
  glyph: GlyphName
  label: string
  shortcut: string
  on: boolean
  onClick: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <button
      type="button"
      aria-pressed={on}
      title={`${label}  ${shortcut}`}
      onClick={onClick}
      className={`ring-focus relative flex h-(--ctrl) items-center gap-1.5 rounded-full px-(--inset) font-medium transition-colors duration-150 ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}
    >
      {on && (
        <motion.span
          layoutId="morph-dock-plate"
          className="absolute inset-0 rounded-full bg-accent-soft shadow-(--press)"
          transition={reduce ? { duration: 0 } : spring.move}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        <Glyph name={glyph} />
        {label}
        <Kbd>{shortcut}</Kbd>
      </span>
    </button>
  )
}

function Running({ state }: { state: State }) {
  const views = state.sessions.page.sessions
  const running = views.filter(isGenerating).length
  if (views.length === 0) return null
  return (
    <span className="font-mono text-sm text-ink-2">
      {running > 0 ? `${running} running` : `${views.length} open`}
    </span>
  )
}

const TOOLS: { id: Tab; label: string; what: string; key: string }[] = [
  { id: "specs", label: "Specs", what: "Layout, box model and tokens of what you pick", key: "S" },
  { id: "tune", label: "Tune", what: "Token dials that write straight to the code", key: "T" },
]

/** Opt-in tools beyond asking for variants, remembered by this browser. */
function Advanced({
  tools,
  onClose,
  dispatch,
}: {
  tools: readonly Tab[]
  onClose: () => void
  dispatch: Dispatch<Event>
}) {
  const ref = useRef<HTMLDivElement>(null)
  useGlass(ref)
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!event.composedPath().some((node) => node === ref.current)) onClose()
    }
    window.addEventListener("pointerdown", away, true)
    return () => {
      window.removeEventListener("pointerdown", away, true)
    }
  }, [onClose])
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Advanced"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: dur.enter, ease: ease.out } }}
      exit={{ opacity: 0, transition: { duration: dur.exit } }}
      className="glass pointer-events-auto absolute bottom-[calc(var(--ctrl)+20px)] grid w-[300px] gap-1 rounded-(--r-panel) p-(--pad)"
    >
      <span className="px-(--inset) pt-1 pb-1 text-xs font-medium tracking-[0.08em] text-ink-3 uppercase">
        Advanced
      </span>
      {TOOLS.map((tool) => {
        const on = tools.includes(tool.id)
        return (
          <button
            key={tool.id}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => {
              dispatch({
                kind: "tools",
                tools: on ? tools.filter((id) => id !== tool.id) : [...tools, tool.id],
              })
            }}
            className="ring-focus flex items-start gap-2.5 rounded-(--r-ctrl) px-(--inset) py-2.5 text-left hover:bg-surface-2"
          >
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                {tool.label}
                <Kbd>{tool.key}</Kbd>
              </span>
              <span className="text-sm text-ink-3">{tool.what}</span>
            </span>
            <span
              className={`mt-0.5 flex h-[18px] w-[30px] flex-none items-center rounded-full p-0.5 transition-colors duration-150 ${on ? "bg-accent" : "bg-surface-3"}`}
            >
              <span
                className={`size-3.5 rounded-full bg-surface-solid shadow-sm transition-transform duration-150 ${on ? "translate-x-3" : ""}`}
              />
            </span>
          </button>
        )
      })}
    </motion.div>
  )
}

/** The launcher while Morph is closed; the session bar, centred on the uncovered page, while open. */
export function Dock({
  state,
  center,
  dispatch,
}: {
  state: State
  center: number
  dispatch: Dispatch<Event>
}) {
  const reduce = useReducedMotion()
  const swap = { duration: reduce ? 0 : 0.2, ease: ease.out }
  const [advanced, setAdvanced] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  useGlass(bar)
  return (
    <motion.div
      className="pointer-events-none fixed bottom-4 z-[2147483645] flex w-0 justify-center"
      initial={false}
      animate={{ left: state.open ? center : innerWidth - 80 }}
      transition={reduce ? { duration: 0 } : spring.move}
    >
      <AnimatePresence>
        {state.open && advanced && (
          <Advanced
            tools={state.tools}
            onClose={() => {
              setAdvanced(false)
            }}
            dispatch={dispatch}
          />
        )}
      </AnimatePresence>
      <motion.div
        ref={bar}
        layout
        role="toolbar"
        aria-label="Morph"
        className="glass pointer-events-auto flex h-[calc(var(--ctrl)+12px)] w-max flex-none items-center gap-1 overflow-hidden rounded-full p-1.5"
        transition={reduce ? { duration: 0 } : spring.move}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {state.open ? (
            <motion.div
              key="bar"
              className="flex items-center gap-1"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { ...swap, delay: reduce ? 0 : 0.05 } }}
              exit={{ opacity: 0, transition: { duration: dur.exit } }}
            >
              <span className="grid size-(--ctrl) place-items-center rounded-full bg-accent text-on-accent shadow-(--press)">
                <Glyph name="logo" />
              </span>
              <Chips state={state} dispatch={dispatch} />
              {/* The hint gives way to the chips when the inspector leaves the bar little room. */}
              {(pinned(state.sessions).length === 0 || state.sidebar.kind === "closed") && (
                <Hint state={state} />
              )}
              <span className="h-4 w-px bg-line" />
              {state.tools.length > 0 && (
                <Tool
                  glyph="panel"
                  label="Inspect"
                  shortcut="\"
                  on={state.sidebar.kind === "open"}
                  onClick={() => {
                    dispatch({ kind: "inspector" })
                  }}
                />
              )}
              <button
                type="button"
                aria-label="Advanced"
                aria-expanded={advanced}
                title="Advanced"
                onClick={() => {
                  setAdvanced(!advanced)
                }}
                className={`ring-focus grid size-(--ctrl) place-items-center rounded-full hover:bg-surface-2 hover:text-ink ${advanced ? "bg-surface-2 text-ink" : "text-ink-2"}`}
              >
                <Glyph name="more" size={16} />
              </button>
              <button
                type="button"
                aria-label="Close Morph"
                title="Close  ⌥⇧R"
                onClick={() => {
                  dispatch({ kind: "toggled" })
                }}
                className="ring-focus grid size-(--ctrl) place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Glyph name="x" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="launcher"
              type="button"
              aria-label="Open Morph (Alt+Shift+R)"
              className="ring-focus flex h-(--ctrl) items-center gap-2 rounded-full pr-1.5 font-medium text-ink"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: swap }}
              exit={{ opacity: 0, transition: { duration: dur.exit } }}
              onClick={() => {
                dispatch({ kind: "toggled" })
              }}
            >
              <span className="grid size-(--ctrl) place-items-center rounded-full bg-accent text-on-accent shadow-(--press)">
                <Glyph name="logo" />
              </span>
              Morph
              <Running state={state} />
              <Kbd>⌥⇧R</Kbd>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
