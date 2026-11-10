import { motion } from "motion/react"
import { type Dispatch, type ReactNode, useRef } from "react"

import { labelNow } from "../catalog"
import { type Event, type Frame, type State } from "../model"
import {
  anchor,
  type Box,
  boxOf,
  labelSpots,
  panelSpan,
  tagSpot,
  uncovered,
  type Viewport,
} from "../place"
import { fmt } from "../specs"
import { firstChildOf, nameOf, pathOf } from "../tree"
import { Glyph, type GlyphName } from "./Glyph"
import { useSize } from "./hooks"
import { Kbd } from "./Kbd"
import { appear } from "./lib/motion"

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
  tone: "accent" | "hover" | "warn" | "measure" | "dim"
  dashed?: boolean
}) {
  const ring = {
    accent: "shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_1px_rgb(0_0_0/0.3)]",
    hover: "shadow-[inset_0_0_0_1px_var(--accent),0_0_0_1px_rgb(0_0_0/0.2)]",
    warn: "bg-warn-soft shadow-[inset_0_0_0_1.5px_var(--warn)]",
    measure: "shadow-[inset_0_0_0_1px_var(--measure)]",
    dim: "shadow-[inset_0_0_0_1px_rgb(124_196_255/0.35)]",
  }[tone]
  return (
    <div
      className={`absolute rounded-[2px] ${dashed ? "outline-1 -outline-offset-1 outline-dashed outline-accent" : ring}`}
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
  tone = "accent",
  children,
  onClick,
}: {
  box: Box
  area: Area
  tone?: "accent" | "measure"
  children: ReactNode
  onClick?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const spot = size ? tagSpot(box, size, area, viewport()) : { x: box.left, y: box.top }
  return (
    <div
      ref={ref}
      className={`absolute flex h-[19px] items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 text-xs font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.25)] ${
        tone === "measure" ? "bg-measure text-white" : "bg-accent text-on-accent"
      } ${onClick ? "pointer-events-auto" : ""}`}
      style={{ left: spot.x, top: spot.y, visibility: size ? "visible" : "hidden" }}
    >
      {children}
    </div>
  )
}

const Dim = ({ children }: { children: ReactNode }) => (
  <span className="tnum font-mono text-[10px] font-medium opacity-60">{children}</span>
)

function Handles({ box }: { box: Box }) {
  const corners = [
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
  ] as const
  return corners.map(([x, y], i) => (
    <div
      key={i}
      className="absolute size-[7px] rounded-[1.5px] bg-white shadow-[0_0_0_1.5px_var(--accent),0_0_0_2.5px_rgb(0_0_0/0.35)]"
      style={{ left: x - 3.5, top: y - 3.5 }}
    />
  ))
}

function BarButton({
  glyph,
  label,
  shortcut,
  on = false,
  title,
  onClick,
}: {
  glyph: GlyphName
  label?: string
  shortcut?: string
  on?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label ?? title}
      aria-pressed={on}
      onClick={onClick}
      className={`ring-focus flex h-7 items-center gap-1.5 rounded-md text-[12.5px] font-medium transition-colors duration-150 ${
        label ? "px-2" : "w-7 justify-center"
      } ${on ? "bg-surface-2 text-accent shadow-[inset_0_0_0_1px_var(--ring)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
    >
      <Glyph name={glyph} />
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}

const Sep = () => <span className="mx-0.5 h-4 w-px flex-none bg-line" />

/** The verbs on a selection: Ask, Morph, Specs, Sketch, and the climb. */
function ActionBar({
  element,
  box,
  area,
  state,
  source,
  dispatch,
}: {
  element: Element
  box: Box
  area: Area
  state: State
  source: string | null
  dispatch: Dispatch<Event>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const { sidebar } = state
  const tab = sidebar.kind === "open" ? sidebar.tab : null
  const spot = size ? anchor(box, size, area, viewport()) : { x: box.left, y: box.bottom + 10 }
  return (
    <motion.div
      ref={ref}
      key={labelNow(element)}
      {...appear}
      role="toolbar"
      aria-label="Selection"
      className="glass pointer-events-auto absolute flex items-center gap-0.5 rounded-lg p-1"
      style={{
        left: spot.x,
        top: spot.y,
        visibility: size ? "visible" : "hidden",
        transformOrigin: "top left",
      }}
    >
      {source && <span className="px-2 font-mono text-[11px] text-ink-2">{source}</span>}
      {source && <Sep />}
      <BarButton
        glyph="ask"
        label="Ask"
        shortcut="A"
        onClick={() => {
          dispatch({ kind: "ask", target: { kind: "element", element }, words: "", tool: null })
        }}
      />
      <BarButton
        glyph="morph"
        label="Morph"
        shortcut="T"
        on={tab === "morph"}
        onClick={() => {
          dispatch({ kind: "tabKey", tab: "morph" })
        }}
      />
      <BarButton
        glyph="specs"
        label="Specs"
        shortcut="S"
        on={tab === "specs"}
        onClick={() => {
          dispatch({ kind: "tabKey", tab: "specs" })
        }}
      />
      <BarButton
        glyph="sketch"
        label="Sketch"
        shortcut="K"
        onClick={() => {
          dispatch({ kind: "ask", target: { kind: "element", element }, words: "", tool: "box" })
        }}
      />
      <Sep />
      <BarButton
        glyph="up"
        title="Select parent  ⇧↵"
        onClick={() => {
          const [parent] = pathOf(element).slice(-1)
          if (parent) dispatch({ kind: "selected", element: parent })
        }}
      />
      <BarButton
        glyph="down"
        title="Select first child  ↵"
        onClick={() => {
          const child = firstChildOf(element)
          if (child) dispatch({ kind: "selected", element: child })
        }}
      />
    </motion.div>
  )
}

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
        className="absolute w-0.5 rounded-full bg-accent"
        style={{ left: x, top, height: bottom - top }}
      />
      <div
        className="tnum absolute whitespace-nowrap rounded-xs bg-surface-solid px-1.5 py-0.5 font-mono text-[10.5px] text-accent shadow-[inset_0_0_0_1px_var(--ring)]"
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
            } ${flagged.has(item) ? "bg-warn text-on-warn" : "bg-surface-solid text-accent shadow-[inset_0_0_0_1px_var(--ring)] hover:bg-accent hover:text-on-accent"}`}
            style={{ left: spot.x, top: spot.y }}
          >
            {name}
          </button>
        )}
      </div>
    )
  })
}

/** Everything Morph draws on the page itself: hover, selection, frame and their verbs. */
export function PageLayer({
  state,
  drag,
  live,
  source,
  dispatch,
}: {
  state: State
  /** The marquee being dragged, in viewport pixels. */
  drag: Box | null
  /** The components inside the marquee being dragged. */
  live: readonly Element[]
  source: string | null
  dispatch: Dispatch<Event>
}) {
  const { sidebar, selection, hover, composer } = state
  const dock = sidebar.kind === "open" ? { side: sidebar.side, width: sidebar.width } : null
  const area = uncovered(dock, viewport())
  const selected = selection.kind === "element" ? selection.element : null
  const outlined =
    drag === null && state.lens === "off" && !(selection.kind === "frame" && hover?.via === "page")
      ? hover
      : null
  const single = outlined?.via === "page" || outlined?.via === "layers" ? outlined.element : null
  const flagged = new Set(outlined?.via === "sheet" ? outlined.elements : [])
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483640] overflow-hidden">
      {selection.kind === "frame" && (
        <>
          <div
            className="absolute rounded-xs outline-1 outline-dashed outline-accent"
            style={boxStyle(frameBox(selection.frame))}
          />
          <FrameLabels
            items={selection.frame.items}
            narrow={selection.frame.narrow}
            flagged={flagged}
            dispatch={dispatch}
          />
        </>
      )}
      {drag && (
        <>
          <div
            className="absolute rounded-xs bg-accent-soft outline-1 outline-dashed outline-accent"
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
      {selection.kind !== "frame" &&
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
      {selected && (
        <Selected
          element={selected}
          area={area}
          state={state}
          source={source}
          bar={composer === null && state.lens === "off"}
          dispatch={dispatch}
        />
      )}
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
  source,
  bar,
  dispatch,
}: {
  element: Element
  area: Area
  state: State
  source: string | null
  bar: boolean
  dispatch: Dispatch<Event>
}) {
  if (!element.isConnected) return null
  const box = boxOf(element.getBoundingClientRect())
  const crumbs = pathOf(element).slice(-2)
  return (
    <>
      <Outline box={box} tone="accent" />
      <Handles box={box} />
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
      {bar && (
        <ActionBar
          element={element}
          box={box}
          area={area}
          state={state}
          source={source}
          dispatch={dispatch}
        />
      )}
    </>
  )
}
