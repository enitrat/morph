import { motion } from "motion/react"
import { type Dispatch, useEffect, useRef } from "react"

import { ask } from "../ask"
import { type Composer as Open, type Event, type SketchTool } from "../model"
import { anchor, type Box, boxOf } from "../place"
import { nameOf } from "../tree"
import { Glyph, type GlyphName } from "./Glyph"
import { fileOf, useSize, useSource } from "./hooks"
import { Kbd } from "./Kbd"
import { appear } from "./lib/motion"
import { type Area, frameBox } from "./PageLayer"

const TOOLS: { id: SketchTool; glyph: GlyphName; label: string }[] = [
  { id: "box", glyph: "box", label: "Box" },
  { id: "arrow", glyph: "arrow", label: "Arrow" },
  { id: "note", glyph: "note", label: "Note" },
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
    name: frame.narrow === null ? `Frame · ${count} components` : `${count} × ${frame.narrow}`,
    box: frameBox(frame),
    element: null,
  }
}

/** The ask: words plus sketch marks, anchored to what it is about. */
export function Composer({
  composer,
  area,
  dispatch,
}: {
  composer: NonNullable<Open>
  area: Area
  dispatch: Dispatch<Event>
}) {
  const card = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const size = useSize(card)
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
  const send = () => {
    void ask({ target: composer.target, words: draft.words, marks: draft.marks }, dispatch)
  }
  const marks = draft.marks.length
  return (
    <motion.div
      ref={card}
      {...appear}
      role="dialog"
      aria-label={`Ask about ${name}`}
      className="glass pointer-events-auto fixed z-[2147483642] grid w-[360px] grid-cols-[minmax(0,1fr)] gap-2.5 rounded-xl p-3"
      style={{
        left: spot.x,
        top: spot.y,
        visibility: size ? "visible" : "hidden",
        transformOrigin: "top left",
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="flex h-[22px] items-center gap-1.5 rounded-md bg-accent-soft px-2 font-medium text-accent shadow-[inset_0_0_0_1px_var(--ring)]">
          <Glyph name={element ? "comp" : "frame"} size={12} />
          <span className="max-w-48 truncate">{name}</span>
        </span>
        {source && (
          <span className="flex h-[22px] items-center rounded-md bg-surface-2 px-2 font-mono text-[11px] text-ink-2">
            {fileOf(source)}
          </span>
        )}
        {marks > 0 && (
          <span className="flex h-[22px] items-center gap-1.5 rounded-md bg-surface-2 pl-2 text-ink-2">
            <Glyph name="sketch" size={12} />
            {marks} mark{marks === 1 ? "" : "s"}
            <button
              type="button"
              aria-label="Clear marks"
              className="grid size-[22px] place-items-center rounded-md hover:text-ink"
              onClick={() => {
                for (const mark of draft.marks) dispatch({ kind: "unmarked", key: mark.key })
              }}
            >
              <Glyph name="x" size={11} />
            </button>
          </span>
        )}
      </div>
      <textarea
        ref={field}
        rows={2}
        value={draft.words}
        placeholder={element ? `Describe a change to ${name}…` : `Ask about ${name.toLowerCase()}…`}
        aria-label="What should change"
        className="ring-focus min-h-[58px] w-full resize-none rounded-lg bg-[rgb(0_0_0/0.25)] px-2.5 py-2 text-[13px] leading-[19px] text-ink shadow-[inset_0_0_0_1px_var(--line)] placeholder:text-ink-3"
        onChange={(event) => {
          dispatch({ kind: "typed", words: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            send()
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            dispatch({ kind: "escape" })
          }
        }}
      />
      <div className="flex items-center gap-1">
        <span
          className="flex gap-0.5 rounded-md bg-surface-2 p-0.5 shadow-[inset_0_0_0_1px_var(--line)]"
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
                className={`ring-focus flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-medium transition-colors duration-150 ${
                  on
                    ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--ring)]"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                <Glyph name={entry.glyph} size={12} />
                {entry.label}
              </button>
            )
          })}
        </span>
        <span className="min-w-0 flex-1 truncate px-1.5 text-[11px] text-ink-3">
          {tool ? "Drag on the page · esc done" : "3 variants"}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={draft.words.trim() === "" && marks === 0}
          className="ring-focus flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-on-accent transition-transform duration-150 active:scale-[0.97] disabled:opacity-40"
        >
          Generate
          <Kbd onInk>↵</Kbd>
        </button>
      </div>
    </motion.div>
  )
}
