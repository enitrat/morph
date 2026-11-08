// Adapted from Detent's MorphingDock (MIT, see LICENSE): one surface that morphs between the
// launcher and the session bar on the dock's spring, with the shared plate under the active tool.
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type Dispatch, type ReactNode } from "react"

import { type Event, type State } from "../model"
import { Glyph, type GlyphName } from "./Glyph"
import { Kbd } from "./Kbd"
import { dur, ease, spring } from "./lib/motion"

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
          layoutId="tune-dock-plate"
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

/** The launcher while Tune is closed; the session bar, centred on the uncovered page, while open. */
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
        aria-label="Tune"
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
              <Hint state={state} />
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
                aria-label="Close Tune"
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
              aria-label="Open Tune (Alt+Shift+R)"
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
              Tune
              <Kbd>⌥⇧R</Kbd>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
