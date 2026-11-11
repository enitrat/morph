import { motion } from "motion/react"
import { type Dispatch, useEffect, useRef } from "react"

import { type SessionActions } from "../ask"
import { type Composer as Open, type Event, type Frame, type SketchTool } from "../model"
import { anchor, type Box, boxOf } from "../place"
import { nameOf } from "../tree"
import { Glyph } from "./Glyph"
import { useGlass } from "./glass"
import { fileOf, useSize, useSource } from "./hooks"
import { appear } from "./lib/motion"
import { groupsOf } from "./FrameSheet"
import { enterChips, Suggestions, useSuggestions } from "./Suggestions"
import { type Area, frameBox } from "./PageLayer"

const TOOLS: { id: SketchTool; label: string }[] = [
  { id: "box", label: "Box" },
  { id: "arrow", label: "Arrow" },
  { id: "note", label: "Note" },
]

/** What the composer is about, and where it sits on the page. */
function about(composer: NonNullable<Open>): { name: string; box: Box; element: Element | null } {
  const { target } = composer
  if (target.kind === "element")
    return {
      name: nameOf(target.element),
      box: boxOf(target.element.getBoundingClientRect()),
      element: target.element,
    }
  const { frame } = target
  const count =
    frame.narrow === null
      ? frame.items.length
      : frame.items.filter((item) => nameOf(item) === frame.narrow).length
  return {
    name:
      frame.narrow === null
        ? `Frame · ${count} component${count === 1 ? "" : "s"}`
        : `${count} × ${frame.narrow}`,
    box: frameBox(frame),
    element: null,
  }
}

/** A frame's repeated component kinds: picking one narrows the ask to every instance of it. */
function Kinds({ frame, dispatch }: { frame: Frame; dispatch: Dispatch<Event> }) {
  const groups = groupsOf(frame).filter(({ elements }) => elements.length > 1)
  if (groups.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Narrow to one kind">
      {groups.map(({ name, elements }) => {
        const on = frame.narrow === name
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onPointerOver={() => {
              dispatch({ kind: "hovered", hover: { via: "sheet", elements } })
            }}
            onPointerOut={() => {
              dispatch({ kind: "hovered", hover: null })
            }}
            onClick={() => {
              dispatch({ kind: "narrowed", name })
            }}
            className={`ring-focus flex h-(--item) items-center gap-1 rounded-full px-(--inset) text-sm transition-colors duration-150 ${
              on ? "bg-accent-soft text-ink shadow-(--press)" : "bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            <span className="max-w-28 truncate">{name}</span>
            <span className="tnum font-mono text-[10.5px] opacity-60">×{elements.length}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The ask: words plus sketch marks, anchored to what it is about. */
export function Composer({
  composer,
  area,
  actions,
  dispatch,
}: {
  composer: NonNullable<Open>
  area: Area
  actions: SessionActions
  dispatch: Dispatch<Event>
}) {
  const card = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const size = useSize(card)
  useGlass(card)
  const { name, box, element } = about(composer)
  const source = useSource(element)
  const { draft, tool } = composer
  const spot = size
    ? anchor(box, size, area, { width: innerWidth, height: innerHeight })
    : { x: box.left, y: box.bottom + 10 }
  // Once it is first shown, since a hidden field cannot take the focus; a mark drawn later asks
  // for its own words in its label.
  const shown = size !== null
  useEffect(() => {
    const input = field.current
    if (!shown || input === null) return
    input.focus({ preventScroll: true })
    input.setSelectionRange(input.value.length, input.value.length)
  }, [composer.target, shown])
  const chips = useRef<HTMLDivElement>(null)
  const { suggestions, prefill } = useSuggestions(source)
  // An empty composer starts with the bridge's words once per target, selected so typing replaces
  // them; words the designer already typed are never overwritten.
  const prefilled = useRef<unknown>(null)
  useEffect(() => {
    const input = field.current
    if (prefill === null || input === null || prefilled.current === composer.target) return
    prefilled.current = composer.target
    if (draft.words !== "") return
    dispatch({ kind: "typed", words: prefill })
    requestAnimationFrame(() => input.select())
  }, [prefill, composer.target, draft.words, dispatch])
  const untouched = draft.words === "" || suggestions.some((entry) => entry.words === draft.words)
  const send = (words = draft.words) => {
    void actions.ask({ target: composer.target, words, marks: draft.marks })
  }
  const marks = draft.marks.length
  return (
    <motion.div
      ref={card}
      {...appear}
      role="dialog"
      aria-label={`Ask about ${name}`}
      className="glass pointer-events-auto fixed z-[2147483642] grid w-[360px] grid-cols-[minmax(0,1fr)] gap-(--gap) rounded-(--r-panel) p-(--pad)"
      style={{
        left: spot.x,
        top: spot.y,
        visibility: size ? "visible" : "hidden",
        transformOrigin: "top left",
      }}
    >
      <div className="flex h-(--ctrl) min-w-0 items-baseline gap-2 px-(--inset) leading-(--ctrl)">
        <span className="truncate font-semibold">{name}</span>
        {source && (
          <span className="truncate font-mono text-sm text-ink-3">{fileOf(source)}</span>
        )}
        {marks > 0 && (
          <span className="ml-auto flex h-(--item) flex-none items-center gap-1.5 self-center rounded-full bg-surface-2 pl-2.5 text-sm leading-none text-ink-2">
            <Glyph name="sketch" size={12} />
            {marks} mark{marks === 1 ? "" : "s"}
            <button
              type="button"
              aria-label="Clear marks"
              className="grid size-(--item) place-items-center rounded-full hover:text-ink"
              onClick={() => {
                for (const mark of draft.marks) dispatch({ kind: "unmarked", key: mark.key })
              }}
            >
              <Glyph name="x" size={11} />
            </button>
          </span>
        )}
      </div>
      {composer.target.kind === "frame" && (
        <Kinds frame={composer.target.frame} dispatch={dispatch} />
      )}
      <textarea
        ref={field}
        rows={2}
        value={draft.words}
        placeholder={element ? `Describe a change to ${name}…` : `Ask about ${name.toLowerCase()}…`}
        aria-label="What should change"
        className="min-h-[calc(var(--ctrl)*2)] w-full resize-none outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring)] rounded-(--r-ctrl) bg-surface-2 px-(--inset) py-[calc((var(--ctrl)-18px)/2)] text-base text-ink placeholder:text-ink-3"
        onChange={(event) => {
          dispatch({ kind: "typed", words: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            send()
          } else if (event.key === "ArrowDown" && untouched) {
            if (enterChips(chips.current)) event.preventDefault()
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            dispatch({ kind: "escape" })
          }
        }}
      />
      {untouched && (
        <Suggestions
          ref={chips}
          suggestions={suggestions}
          onPick={send}
          onLeave={() => field.current?.focus()}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex h-(--ctrl) items-center rounded-full bg-surface-2 p-1"
          role="radiogroup"
          aria-label="Sketch"
        >
          {TOOLS.map((entry) => {
            const on = tool === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={`${entry.label}: draw on the page`}
                onClick={() => {
                  dispatch({ kind: "tool", tool: on ? null : entry.id })
                }}
                className={`ring-focus flex h-(--item) items-center rounded-(--r-item) px-[calc(var(--inset)-4px)] text-sm transition-colors duration-150 ${
                  on ? "bg-accent-soft text-ink shadow-(--press)" : "text-ink-2 hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            )
          })}
        </span>
        <button
          type="button"
          onClick={() => {
            send()
          }}
          disabled={draft.words.trim() === "" && marks === 0}
          className="ring-focus flex h-(--ctrl) items-center gap-1.5 rounded-full bg-accent px-(--r-ctrl) font-semibold text-on-accent shadow-(--press) transition-transform duration-150 active:scale-[0.97] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
        >
          Generate
        </button>
      </div>
    </motion.div>
  )
}
