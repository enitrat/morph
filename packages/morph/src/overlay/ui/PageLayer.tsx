import { type Dispatch, type ReactNode, useRef } from "react"

import { type Event, type Frame, selectedOf, type State } from "../model"
import { type Box, boxOf, labelSpots, panelSpan, tagSpot, uncovered, type Viewport } from "../place"
import { fmt } from "../specs"
import { nameOf, pathOf } from "../tree"
import { useSize } from "./hooks"

export type Area = { left: number; right: number }

const viewport = (): Viewport => ({ width: innerWidth, height: innerHeight })
const dims = (box: Box) => `${fmt(box.right - box.left)}×${fmt(box.bottom - box.top)}`

/** A frame's rectangle, from document to viewport coordinates. */
export const frameBox = (frame: Frame): Box => ({
  left: frame.rect.left - scrollX,
  top: frame.rect.top - scrollY,
  right: frame.rect.left - scrollX + frame.rect.width,
  bottom: frame.rect.top - scrollY + frame.rect.height,
})

export function Outline({
  box,
  tone,
  dashed = false,
}: {
  box: Box
  tone: "mark" | "hover" | "warn" | "dim"
  dashed?: boolean
}) {
  const ring = {
    mark: "shadow-[0_0_0_2px_var(--mark),0_0_0_5px_var(--mark-soft)]",
    hover: "shadow-[0_0_0_1px_var(--mark)]",
    warn: "bg-warn-soft shadow-[inset_0_0_0_1.5px_var(--warn)]",
    dim: "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--mark)_45%,transparent)]",
  }[tone]
  return (
    <div
      className={`absolute rounded-[3px] ${dashed ? "outline-1 -outline-offset-1 outline-dashed outline-mark" : ring}`}
      style={{
        left: box.left,
        top: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      }}
    />
  )
}

/** A name tag on a box's top edge, measured so it never runs off the page or under the inspector. */
export function Tag({
  box,
  area,
  children,
  onClick,
}: {
  box: Box
  area: Area
  children: ReactNode
  onClick?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const spot = size ? tagSpot(box, size, area, viewport()) : { x: box.left, y: box.top }
  return (
    <div
      ref={ref}
      className={`absolute flex h-[19px] items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 text-xs font-semibold bg-mark text-on-mark shadow-[0_1px_2px_oklch(0_0_0/0.25)] ${onClick ? "pointer-events-auto" : ""}`}
      style={{ left: spot.x, top: spot.y, visibility: size ? "visible" : "hidden" }}
    >
      {children}
    </div>
  )
}

const Dim = ({ children }: { children: ReactNode }) => (
  <span className="tnum font-mono text-[10px] font-medium opacity-60">{children}</span>
)

/** How much of a selection runs under the inspector, marked on the inspector's edge. */
function UnderPanel({
  box,
  sidebar,
}: {
  box: Box
  sidebar: Extract<State["sidebar"], { kind: "open" }>
}) {
  const [a, b] = panelSpan(sidebar.side, sidebar.width, viewport())
  const under = Math.min(box.right, b) - Math.max(box.left, a)
  const top = Math.max(box.top, 18)
  const bottom = Math.min(box.bottom, innerHeight - 18)
  if (under <= 0 || bottom - top < 12) return null
  const x = sidebar.side === "right" ? a - 3 : b + 1
  return (
    <>
      <div
        className="absolute w-0.5 rounded-full bg-mark"
        style={{ left: x, top, height: bottom - top }}
      />
      <div
        className="tnum absolute whitespace-nowrap rounded-xs bg-surface-solid px-1.5 py-0.5 font-mono text-[10.5px] text-ink shadow-[inset_0_0_0_1px_var(--ring)]"
        style={{
          top: (top + bottom) / 2 - 9,
          ...(sidebar.side === "right" ? { right: innerWidth - a + 8 } : { left: b + 8 }),
        }}
      >
        {Math.round(under)}px under panel
      </div>
    </>
  )
}

/** Labels for the components inside a frame, the ones that would collide hidden. */
function FrameLabels({
  items,
  narrow,
  flagged,
  dispatch,
}: {
  items: readonly Element[]
  narrow: string | null
  flagged: ReadonlySet<Element>
  dispatch: Dispatch<Event> | null
}) {
  const boxes = items.map((item) => boxOf(item.getBoundingClientRect()))
  const names = items.map(nameOf)
  const spots = labelSpots(
    boxes,
    names.map((name) => name.length * 6.2 + 12),
    (i) => flagged.has(items[i] as Element),
  )
  return items.map((item, i) => {
    const box = boxes[i] as Box
    const name = names[i] as string
    const spot = spots[i]
    const dim = narrow !== null && name !== narrow
    return (
      <div key={i} className={dim ? "opacity-30" : ""}>
        <Outline box={box} tone={flagged.has(item) ? "warn" : "dim"} />
        {spot && (
          <button
            type="button"
            tabIndex={-1}
            onClick={
              dispatch
                ? () => {
                    dispatch({ kind: "selected", element: item })
                  }
                : undefined
            }
            className={`absolute h-4 whitespace-nowrap rounded-[3px] px-1.5 font-mono text-[10px] font-medium leading-4 ${
              dispatch ? "pointer-events-auto" : ""
            } ${flagged.has(item) ? "bg-warn text-on-warn" : "bg-surface-solid text-ink shadow-[inset_0_0_0_1px_var(--ring)] hover:bg-mark hover:text-on-mark"}`}
            style={{ left: spot.x, top: spot.y }}
          >
            {name}
          </button>
        )}
      </div>
    )
  })
}

/** Everything Morph draws on the page itself: hover, selection and frame. */
export function PageLayer({
  state,
  drag,
  live,
  dispatch,
}: {
  state: State
  /** The marquee being dragged, in viewport pixels. */
  drag: Box | null
  /** The components inside the marquee being dragged. */
  live: readonly Element[]
  dispatch: Dispatch<Event>
}) {
  const { sidebar, hover, composer } = state
  const dock = sidebar.kind === "open" ? { side: sidebar.side, width: sidebar.width } : null
  const area = uncovered(dock, viewport())
  const selected = selectedOf(state)
  const frame = composer?.target.kind === "frame" ? composer.target.frame : null
  const outlined = drag === null && !(frame !== null && hover?.via === "page") ? hover : null
  const single = outlined?.via === "page" || outlined?.via === "panel" ? outlined.element : null
  const flagged = new Set(outlined?.via === "sheet" ? outlined.elements : [])
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483640] overflow-hidden">
      {frame && (
        <>
          <div
            className="absolute rounded-xs outline-1 outline-dashed outline-mark"
            style={boxStyle(frameBox(frame))}
          />
          <FrameLabels
            items={frame.items}
            narrow={frame.narrow}
            flagged={flagged}
            dispatch={dispatch}
          />
        </>
      )}
      {drag && (
        <>
          <div
            className="absolute rounded-xs bg-mark-soft outline-1 outline-dashed outline-mark"
            style={boxStyle(drag)}
          />
          <FrameLabels items={live} narrow={null} flagged={new Set()} dispatch={null} />
          <div
            className="tnum absolute rounded-xs bg-surface-solid px-1.5 py-0.5 font-mono text-[10.5px] text-ink shadow-[inset_0_0_0_1px_var(--line)]"
            style={{ left: drag.right - 64, top: drag.bottom + 6 }}
          >
            {Math.round(drag.right - drag.left)} × {Math.round(drag.bottom - drag.top)}
          </div>
        </>
      )}
      {frame === null &&
        [...flagged].map((element, i) => (
          <Outline key={i} box={boxOf(element.getBoundingClientRect())} tone="warn" />
        ))}
      {single && single !== selected && (
        <Hovered
          element={single}
          area={area}
          preview={sidebar.kind === "open" && sidebar.tab === "specs" && outlined?.via === "page"}
        />
      )}
      {selected && <Selected element={selected} area={area} state={state} dispatch={dispatch} />}
    </div>
  )
}

const boxStyle = (box: Box) => ({
  left: box.left,
  top: box.top,
  width: box.right - box.left,
  height: box.bottom - box.top,
})

function Hovered({ element, area, preview }: { element: Element; area: Area; preview: boolean }) {
  const box = boxOf(element.getBoundingClientRect())
  return (
    <>
      <Outline box={box} tone="hover" />
      <Tag box={box} area={area}>
        {nameOf(element)}
        <Dim>{dims(box)}</Dim>
        {preview && <Dim>· click to inspect</Dim>}
      </Tag>
    </>
  )
}

function Selected({
  element,
  area,
  state,
  dispatch,
}: {
  element: Element
  area: Area
  state: State
  dispatch: Dispatch<Event>
}) {
  if (!element.isConnected) return null
  const box = boxOf(element.getBoundingClientRect())
  const crumbs = pathOf(element).slice(-2)
  return (
    <>
      <Outline box={box} tone="mark" />
      <Tag box={box} area={area} onClick={() => {}}>
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <button
              type="button"
              className="font-medium opacity-60 hover:underline hover:underline-offset-2 hover:opacity-100"
              onClick={() => {
                dispatch({ kind: "selected", element: crumb })
              }}
            >
              {nameOf(crumb)}
            </button>
            <span className="opacity-40">/</span>
          </span>
        ))}
        {nameOf(element)}
        <Dim>{dims(box)}</Dim>
      </Tag>
      {state.sidebar.kind === "open" && <UnderPanel box={box} sidebar={state.sidebar} />}
    </>
  )
}
