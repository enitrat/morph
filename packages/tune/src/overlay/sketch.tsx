import { type Dispatch, type PointerEvent, useEffect, useRef, useState } from "react"

import { arrowCaption, boxCaption, SPATIAL } from "../inspector/label"
import { leafAt, meaningfulFrom } from "../inspector/target"
import { catalogNow, shortNow } from "./catalog"
import { liftHead, type Snapped, snapBox, snapHead } from "./snap"
import { type Event, type Sketch, type Spot, type Tool } from "./state"

const MIN_DRAG = 8

let nextKey = 1

const spotOf = (event: PointerEvent): Spot => ({
  x: event.clientX + window.scrollX,
  y: event.clientY + window.scrollY,
})

/** The meaningful page element under a point, as pointing would land on it. */
function boxAt(x: number, y: number): Element | null {
  const hit = leafAt(x, y)
  return hit && meaningfulFrom(hit, catalogNow())
}

/** What an arrow moves, and where its head lands. */
interface Aim {
  source: Element
  head: Element
  to: Snapped & { level: number }
  caption: string
}

/**
 * What the arrow moves, the block under where the drag starts, and where; or why it cannot be
 * read, in one sentence for the designer.
 */
export function aimOf(from: Spot, to: Spot, level: number): Aim | { why: string } {
  const source = boxAt(from.x - window.scrollX, from.y - window.scrollY)
  if (source === null) return { why: "Start the arrow on the block you want to move." }
  const [x, y] = [to.x - window.scrollX, to.y - window.scrollY]
  const end = leafAt(x, y)
  if (end === null) return { why: "End the arrow on the page, where the block should go." }
  if (source.contains(end))
    return { why: "The arrow ends inside the block it moves. End it outside that block." }
  const head = snapHead(x, y, source)
  if (head === null)
    return { why: "Tune can't tell where this goes. End the arrow beside a block." }
  const lifted = liftHead(head.element, source, level, y, catalogNow())
  const at = level === 0 ? { ...head, level: 0 } : lifted
  return {
    source,
    head: head.element,
    to: at,
    caption: arrowCaption(shortNow(source), at.place, shortNow(at.element)),
  }
}

/** An arrow's target moved to `level` blocks above where its head first snapped. */
export function reaimed(mark: Extract<Sketch, { kind: "arrow" }>, level: number) {
  const to = liftHead(mark.head, mark.source, level, mark.to.y - window.scrollY, catalogNow())
  return {
    target: to.element,
    place: to.place,
    level: to.level,
    snapped: arrowCaption(shortNow(mark.source), to.place, shortNow(to.element)),
  }
}

/** The mark a gesture drew, snapped to the page, or why not; `null` when it lands on nothing. */
function markOf(tool: Tool, from: Spot, to: Spot, level: number): Sketch | { why: string } | null {
  const [sx, sy, ex, ey] = [
    from.x - window.scrollX,
    from.y - window.scrollY,
    to.x - window.scrollX,
    to.y - window.scrollY,
  ]
  const dragged = Math.hypot(ex - sx, ey - sy) >= MIN_DRAG
  const key = nextKey++
  if (tool === "note") {
    const element = boxAt(ex, ey)
    return element && { kind: "note", key, snapped: shortNow(element), at: to, element, text: "" }
  }
  if (!dragged) return null
  if (tool === "box") {
    const box = {
      left: Math.min(sx, ex),
      top: Math.min(sy, ey),
      right: Math.max(sx, ex),
      bottom: Math.max(sy, ey),
    }
    const snapped = snapBox(box)
    return (
      snapped && {
        kind: "box",
        key,
        snapped: shortNow(snapped.element),
        from,
        to,
        at: snapped.element,
        place: snapped.place,
        label: "",
      }
    )
  }
  if (tool !== "arrow") return null
  const aim = aimOf(from, to, level)
  if ("why" in aim) return aim
  return {
    kind: "arrow",
    key,
    snapped: aim.caption,
    from,
    to,
    source: aim.source,
    target: aim.to.element,
    place: aim.to.place,
    head: aim.head,
    level: aim.to.level,
  }
}

const boxOf = (element: Element) => {
  const box = element.getBoundingClientRect()
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

/** The source and the snapped target outlined, the target's edge marking the place. */
function AimBoxes({
  source,
  target,
  place,
}: {
  source: Element
  target: Element
  place: Snapped["place"]
}) {
  return (
    <>
      <div
        className="aim aim-source"
        style={boxOf(source)}
      />
      <div
        className="aim aim-target"
        data-place={place}
        style={boxOf(target)}
      >
        <span className="aim-place">{SPATIAL[place]}</span>
      </div>
    </>
  )
}

/** The drawing surface for the box, arrow and note tools: one gesture, one mark. */
export function SketchLayer({
  tool,
  dispatch,
  onArrow,
}: {
  tool: Exclude<Tool, "point" | "inspect">
  dispatch: Dispatch<Event>
  /** An arrow was drawn: Tab may still aim it higher. */
  onArrow: (key: number) => void
}) {
  const [drag, setDrag] = useState<{ from: Spot; to: Spot; level: number } | null>(null)
  // An arrow that could not be read stays drawn with the reason until the next drag.
  const [missed, setMissed] = useState<{ from: Spot; to: Spot; why: string } | null>(null)
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging || tool !== "arrow") return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      event.preventDefault()
      event.stopPropagation()
      setDrag((now) => now && { ...now, level: now.level + 1 })
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
    }
  }, [dragging, tool])
  const aim = drag && tool === "arrow" ? aimOf(drag.from, drag.to, drag.level) : null
  const line = drag ?? missed
  // A reason shows mid-drag only once the arrow is long enough to mean something.
  const why =
    aim && "why" in aim
      ? drag && Math.hypot(drag.to.x - drag.from.x, drag.to.y - drag.from.y) >= 3 * MIN_DRAG
        ? aim.why
        : null
      : (missed?.why ?? null)
  return (
    <div
      className="layer"
      aria-hidden="true"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setMissed(null)
        setDrag({ from: spotOf(event), to: spotOf(event), level: 0 })
      }}
      onPointerMove={(event) => {
        if (drag) setDrag({ ...drag, to: spotOf(event) })
      }}
      onPointerUp={(event) => {
        if (!drag) return
        setDrag(null)
        const to = spotOf(event)
        const mark = markOf(tool, drag.from, to, drag.level)
        if (mark === null) return
        if ("why" in mark) {
          setMissed({ from: drag.from, to, why: mark.why })
          return
        }
        dispatch({ kind: "marked", mark })
        dispatch({ kind: "tool", tool: null })
        if (mark.kind === "arrow") onArrow(mark.key)
      }}
    >
      {aim && drag && !("why" in aim) && (
        <>
          <AimBoxes
            source={aim.source}
            target={aim.to.element}
            place={aim.to.place}
          />
          <span
            className="snap-tag"
            style={{ left: drag.to.x - window.scrollX + 12, top: drag.to.y - window.scrollY + 12 }}
          >
            {aim.caption} · Tab aims higher
          </span>
        </>
      )}
      {line && why !== null && (
        <span
          className="snap-tag"
          style={{ left: line.to.x - window.scrollX + 12, top: line.to.y - window.scrollY + 12 }}
        >
          {why}
        </span>
      )}
      {line && tool !== "note" && (
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
        >
          <Defs />
          {tool === "box" ? (
            <rect
              x={Math.min(line.from.x, line.to.x) - window.scrollX}
              y={Math.min(line.from.y, line.to.y) - window.scrollY}
              width={Math.abs(line.to.x - line.from.x)}
              height={Math.abs(line.to.y - line.from.y)}
              rx="6"
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeDasharray="5 4"
              strokeWidth="1.5"
            />
          ) : (
            <line
              x1={line.from.x - window.scrollX}
              y1={line.from.y - window.scrollY}
              x2={line.to.x - window.scrollX}
              y2={line.to.y - window.scrollY}
              stroke="var(--accent)"
              strokeWidth="2"
              markerEnd="url(#tune-head)"
            />
          )}
        </svg>
      )}
    </div>
  )
}

function Defs() {
  return (
    <defs>
      <marker
        id="tune-head"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path
          d="M0 0 L10 5 L0 10 z"
          fill="var(--accent)"
        />
      </marker>
    </defs>
  )
}

/** Keeps `page` at document coordinates while the window scrolls, without a render per frame. */
function useScrollFollow() {
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const follow = () => {
      if (page.current)
        page.current.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`
    }
    follow()
    window.addEventListener("scroll", follow, { passive: true, capture: true })
    return () => {
      window.removeEventListener("scroll", follow, { capture: true })
    }
  }, [])
  return page
}

function Label({
  mark,
  editable,
  dispatch,
  x,
  y,
  placeholder,
}: {
  mark: Extract<Sketch, { kind: "box" | "note" }>
  editable: boolean
  dispatch: Dispatch<Event>
  x: number
  y: number
  placeholder: string
}) {
  const text = mark.kind === "box" ? mark.label : mark.text
  const input = useRef<HTMLInputElement>(null)
  // A mark drawn just now asks for its words at once.
  const fresh = useRef(text === "")
  useEffect(() => {
    if (fresh.current) input.current?.focus()
  }, [])
  return editable ? (
    <input
      ref={input}
      className="label-input"
      style={{ left: x, top: y }}
      value={text}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => {
        dispatch({ kind: "relabeled", key: mark.key, text: event.target.value })
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape" && text === "") dispatch({ kind: "unmarked", key: mark.key })
      }}
    />
  ) : (
    text !== "" && (
      <span
        className="snap-tag"
        style={{ left: x, top: y }}
      >
        {text}
      </span>
    )
  )
}

/** Every mark of the draft, on its spot in the page. */
export function Marks({
  marks,
  editable,
  aimed,
  dispatch,
}: {
  marks: readonly Sketch[]
  editable: boolean
  /** The arrow Tab still aims: its source and target stay outlined. */
  aimed: number | null
  dispatch: Dispatch<Event>
}) {
  const page = useScrollFollow()
  const aim = marks.find((mark) => mark.key === aimed && mark.kind === "arrow")
  return (
    <div className="drawn">
      {aim?.kind === "arrow" && (
        <AimBoxes
          source={aim.source}
          target={aim.target}
          place={aim.place}
        />
      )}
      <div
        ref={page}
        className="drawn-page"
      >
        <svg
          width="1"
          height="1"
        >
          <Defs />
          {marks.flatMap((mark) =>
            mark.kind === "arrow"
              ? [
                  <line
                    key={mark.key}
                    x1={mark.from.x}
                    y1={mark.from.y}
                    x2={mark.to.x}
                    y2={mark.to.y}
                    stroke="var(--accent)"
                    strokeWidth="2"
                    markerEnd="url(#tune-head)"
                  />,
                ]
              : [],
          )}
        </svg>
        {marks.map((mark) => {
          if (mark.kind === "arrow")
            return (
              <span
                key={mark.key}
                className="snap-tag"
                style={{ left: mark.to.x + 8, top: mark.to.y + 6 }}
              >
                {mark.snapped}
              </span>
            )
          if (mark.kind === "note")
            return (
              <Label
                key={mark.key}
                mark={mark}
                editable={editable}
                dispatch={dispatch}
                x={mark.at.x}
                y={mark.at.y}
                placeholder={`Note on ${mark.snapped}`}
              />
            )
          const left = Math.min(mark.from.x, mark.to.x)
          const top = Math.min(mark.from.y, mark.to.y)
          return (
            <div key={mark.key}>
              <div
                className="box-mark"
                style={{
                  left,
                  top,
                  width: Math.abs(mark.to.x - mark.from.x),
                  height: Math.abs(mark.to.y - mark.from.y),
                }}
              />
              <span
                className="snap-tag"
                style={{ left, top: Math.max(mark.from.y, mark.to.y) + 4 }}
              >
                {boxCaption(mark.label, mark.place, mark.snapped)}
              </span>
              <Label
                mark={mark}
                editable={editable}
                dispatch={dispatch}
                x={left}
                y={top - 30}
                placeholder={mark.place === "around" ? "What changes here?" : "What goes here?"}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
