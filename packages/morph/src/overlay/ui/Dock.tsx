// Adapted from Detent's MorphingDock (MIT, see LICENSE): one surface that morphs between the
// launcher and the session bar on the dock's spring, with the shared plate under the active tool.
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type Dispatch, type ReactNode } from "react"

import { type Event, type State } from "../model"
import { isGenerating, pinned, statusOf } from "../sessions"
import { Glyph, type GlyphName } from "./Glyph"
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
        const status = statusOf(view)
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
            className={`ring-focus flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-[12px] transition-colors duration-150 ${
              on ? "bg-surface-2 shadow-[inset_0_0_0_1px_var(--ring)]" : "hover:bg-surface-2"
            }`}
          >
            <Disc pin={pin} view={view} size={22} />
            <span className="max-w-24 truncate font-medium text-ink">{pin.name}</span>
            <span
              className={`font-mono text-[11px] ${
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
            className={`glass flex w-max max-w-[520px] flex-none items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] ${
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
  const parts: ReactNode[] =
    state.lens !== "off"
      ? [
          <span key="m" className="flex items-center gap-1.5 text-measure">
            <Glyph name="measure" size={13} />
            Measuring
          </span>,
          state.lens === "held" ? (
            <span key="r">release {k("⌥")}</span>
          ) : (
            <span key="r">{k("I")} to stop</span>
          ),
        ]
      : state.composer?.tool
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
          : state.selection.kind === "element"
            ? [
                <span key="p">{k("⇧↵")} parent</span>,
                <span key="c">{k("↵")} child</span>,
                <span key="s">{k("⇥")} sibling</span>,
                <span key="m">hold {k("⌥")} measure</span>,
              ]
            : state.selection.kind === "frame"
              ? [
                  <span key="l">Click a label to select</span>,
                  <span key="a">{k("A")} ask about frame</span>,
                  <span key="e">{k("esc")} clear</span>,
                ]
              : [
                  <span key="c">Click to select</span>,
                  <span key="d">Drag to frame</span>,
                  <span key="m">Hold {k("⌥")} to measure</span>,
                ]
  return (
    <span className="flex items-center gap-3 px-2 text-[12px] whitespace-nowrap text-ink-2">
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
      className={`ring-focus relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-150 ${on ? "text-accent" : "text-ink-2 hover:text-ink"}`}
    >
      {on && (
        <motion.span
          layoutId="morph-dock-plate"
          className="absolute inset-0 rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--ring)]"
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
    <span className="font-mono text-[11px] text-accent">
      {running > 0 ? `${running} running` : `${views.length} open`}
    </span>
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
  return (
    <motion.div
      className="pointer-events-none fixed bottom-4 z-[2147483645] flex w-0 justify-center"
      initial={false}
      animate={{ left: state.open ? center : innerWidth - 80 }}
      transition={reduce ? { duration: 0 } : spring.move}
    >
      <motion.div
        layout
        role="toolbar"
        aria-label="Morph"
        className="glass pointer-events-auto flex h-11 w-max flex-none items-center gap-1 overflow-hidden rounded-full px-1.5"
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
              <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent">
                <Glyph name="logo" />
              </span>
              <Chips state={state} dispatch={dispatch} />
              {/* The hint gives way to the chips when the inspector leaves the bar little room. */}
              {(pinned(state.sessions).length === 0 || state.sidebar.kind === "closed") && (
                <Hint state={state} />
              )}
              <span className="h-4 w-px bg-line" />
              <Tool
                glyph="measure"
                label="Measure"
                shortcut="I"
                on={state.lens !== "off"}
                onClick={() => {
                  dispatch({ kind: "latched" })
                }}
              />
              <Tool
                glyph="panel"
                label="Inspect"
                shortcut="\"
                on={state.sidebar.kind === "open"}
                onClick={() => {
                  dispatch({ kind: "inspector" })
                }}
              />
              <button
                type="button"
                aria-label="Close Morph"
                title="Close  ⌥⇧R"
                onClick={() => {
                  dispatch({ kind: "toggled" })
                }}
                className="ring-focus grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Glyph name="x" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="launcher"
              type="button"
              aria-label="Open Morph (Alt+Shift+R)"
              className="ring-focus flex h-8 items-center gap-2 rounded-full pr-1.5 pl-0.5 text-[12.5px] font-medium text-ink"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: swap }}
              exit={{ opacity: 0, transition: { duration: dur.exit } }}
              onClick={() => {
                dispatch({ kind: "toggled" })
              }}
            >
              <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent">
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
