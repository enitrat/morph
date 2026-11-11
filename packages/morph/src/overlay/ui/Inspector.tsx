import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type Dispatch, type ReactNode } from "react"

import { FineTune } from "../fine-tune"
import { targetElements } from "../pinned-targets"
import { pinned, type Sessions } from "../sessions"
import { type Event, type State, type Tab } from "../model"
import { MARGIN } from "../place"
import { type Scales } from "../scale"
import { keyOf } from "../source"
import { fmt } from "../specs"
import { nameOf } from "../tree"
import { type ShownTheme } from "../theme"
import { Glyph } from "./Glyph"
import { fileOf, useSource } from "./hooks"
import { Kbd } from "./Kbd"
import { FrameSheet } from "./FrameSheet"
import { ElementSpecs, type Comparison } from "./Specs"
import { ease, spring } from "./lib/motion"
import { Empty, Identity } from "./parts"

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: "specs", label: "Specs", key: "S" },
  { id: "morph", label: "Morph", key: "T" },
]

function Primary({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ring-focus flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-on-accent shadow-[0_6px_16px_-6px_rgb(124_196_255/0.6)] transition-transform duration-150 active:scale-[0.97]"
    >
      <Glyph name="ask" />
      {children}
    </button>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">{children}</span>
  )
}

/** Every saved target reference associated with this element, including ambiguous spatial matches. */
function comparisonsFor(element: Element, sessions: Sessions): Comparison[] {
  return pinned(sessions).flatMap(({ pin }) =>
    pin.targets.flatMap((target, slot) =>
      target.match.kind !== "missing" && target.match.element === element
        ? [{ thread: pin.id, n: pin.n, slot, target }]
        : [],
    ),
  )
}

function SpecsTab({
  state,
  preview,
  scales,
  dispatch,
}: {
  state: State
  preview: Element | null
  scales: Scales
  dispatch: Dispatch<Event>
}) {
  const { selection, sessions } = state
  const committed = selection.kind === "element" ? selection.element : null
  const card = sessions.card === null ? undefined : sessions.pins[sessions.card]
  // With nothing selected, Specs reads the open card's target.
  const settled = committed ?? (card && targetElements(card.targets)[0]) ?? null
  const element = preview !== null && preview !== settled ? preview : settled
  if (element !== null && element.isConnected)
    return (
      <ElementSpecs
        key={element === settled ? "committed" : "preview"}
        element={element}
        preview={element !== settled}
        comparisons={comparisonsFor(element, sessions)}
        scales={scales}
        dispatch={dispatch}
      />
    )
  if (selection.kind === "frame")
    return <FrameSheet frame={selection.frame} scales={scales} dispatch={dispatch} />
  return (
    <Empty title="Point at anything">
      Hover the page to preview an element's specs here. Click to keep it. Drag a frame to read a
      whole section.
      <div className="mt-5 grid justify-center gap-2 text-left">
        {[
          ["click", "Inspect an element"],
          ["drag", "Frame a section"],
        ].map(([key, what]) => (
          <div key={key} className="flex items-center gap-2.5">
            <span className="w-10 text-right">
              <Kbd>{key as string}</Kbd>
            </span>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </Empty>
  )
}

function MorphTab({ element, theme }: { element: Element | null; theme: ShownTheme | null }) {
  const source = useSource(element)
  if (element === null)
    return (
      <Empty title="Nothing to morph">
        Select an element on the page. Its spacing, colour and props show here as dials that write
        to the code.
      </Empty>
    )
  const box = element.getBoundingClientRect()
  return (
    <>
      <Identity
        kicker="Morph · writes to code"
        glyph="morph"
        name={nameOf(element)}
        dims={`${fmt(box.width)}×${fmt(box.height)}`}
        source={source ? `${source.path}:${source.line}` : null}
      />
      <div className="px-3.5 py-3">
        {theme === null ? (
          <p className="text-[12px] text-ink-3">Reading the design system…</p>
        ) : (
          <FineTune key={`${keyOf(element)} ${theme.name}`} target={element} theme={theme} />
        )}
      </div>
    </>
  )
}

function Foot({
  state,
  preview,
  dispatch,
}: {
  state: State
  preview: Element | null
  dispatch: Dispatch<Event>
}) {
  const { selection, sidebar } = state
  const element = selection.kind === "element" ? selection.element : null
  const source = useSource(element)
  if (sidebar.kind !== "open") return null
  let body: ReactNode
  if (sidebar.tab === "specs" && preview !== null && preview !== element)
    body = <Note>Previewing. Click on the page to inspect it.</Note>
  else if (selection.kind === "frame")
    body = (
      <>
        <Note>Fix opens a scoped ask</Note>
        <Primary
          onClick={() => {
            dispatch({
              kind: "ask",
              target: { kind: "frame", frame: selection.frame },
              words: "",
              tool: null,
            })
          }}
        >
          Ask about {selection.frame.narrow === null ? "frame" : "these"}
          <Kbd onInk>A</Kbd>
        </Primary>
      </>
    )
  else if (element !== null)
    body = (
      <>
        <Note>
          {sidebar.tab === "morph"
            ? "Steps preview live, release writes"
            : source
              ? fileOf(source)
              : ""}
        </Note>
        <Primary
          onClick={() => {
            dispatch({ kind: "ask", target: { kind: "element", element }, words: "", tool: null })
          }}
        >
          <span className="max-w-32 truncate">Ask about {nameOf(element)}</span>
          <Kbd onInk>A</Kbd>
        </Primary>
      </>
    )
  else return null
  return (
    <div className="flex h-12 flex-none items-center gap-2 border-t border-line px-3.5">{body}</div>
  )
}

/** The inspector: floats over the page on the side the selection leaves free, never reflowing it. */
export function Inspector({
  state,
  preview,
  scales,
  theme,
  dispatch,
}: {
  state: State
  preview: Element | null
  scales: Scales
  theme: ShownTheme | null
  dispatch: Dispatch<Event>
}) {
  const reduce = useReducedMotion()
  const { sidebar } = state
  const open = sidebar.kind === "open" ? sidebar : null
  const from = open?.side === "left" ? -24 : 24
  return (
    <AnimatePresence mode="wait" initial={false}>
      {open && (
        <motion.aside
          key={open.side}
          aria-label="Inspector"
          className="glass pointer-events-auto fixed z-[2147483643] flex flex-col overflow-hidden rounded-xl"
          style={{ top: MARGIN, bottom: MARGIN, [open.side]: MARGIN }}
          initial={
            reduce ? { opacity: 0, width: open.width } : { opacity: 0, x: from, width: open.width }
          }
          animate={{ opacity: 1, x: 0, width: open.width }}
          exit={{ opacity: 0, x: from, transition: { duration: 0.12, ease: ease.out } }}
          transition={{
            opacity: { duration: 0.17, ease: ease.out },
            x: { duration: 0.17, ease: ease.out },
            width: spring.smooth,
          }}
        >
          <div className="flex h-11 flex-none items-center gap-0.5 border-b border-line px-1.5">
            {TABS.map((tab) => {
              const on = open.tab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    dispatch({ kind: "tab", tab: tab.id })
                  }}
                  className={`ring-focus relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-150 ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {on && (
                    <motion.span
                      layoutId="morph-inspector-tab"
                      className="absolute inset-0 rounded-md bg-surface-3 shadow-[inset_0_0_0_1px_var(--line)]"
                      transition={reduce ? { duration: 0 } : spring.snappy}
                    />
                  )}
                  <span className="relative">{tab.label}</span>
                  <span className="relative">
                    <Kbd>{tab.key}</Kbd>
                  </span>
                </button>
              )
            })}
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Close inspector"
              title="Close inspector  \"
              onClick={() => {
                dispatch({ kind: "inspector" })
              }}
              className="ring-focus grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Glyph name="x" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--surface-3)_transparent] [scrollbar-width:thin]">
            {open.tab === "specs" && (
              <SpecsTab state={state} preview={preview} scales={scales} dispatch={dispatch} />
            )}
            {open.tab === "morph" && (
              <MorphTab
                element={state.selection.kind === "element" ? state.selection.element : null}
                theme={theme}
              />
            )}
          </div>
          <Foot state={state} preview={open.tab === "specs" ? preview : null} dispatch={dispatch} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
