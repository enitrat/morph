import { type PointerEvent, useEffect, useId, useRef, useState } from "react"

import {
  type MeasuredBox,
  type MeasureRect,
  type Measurements,
  measurementFrame,
  measureRegion,
  measureBox,
} from "../inspector/measure"
import { leafAt, meaningfulFrom } from "../inspector/target"
import { catalogNow } from "./catalog"

interface Point {
  x: number
  y: number
}
type Gesture =
  | { kind: "idle" }
  | { kind: "drawing"; pointer: number; from: Point; to: Point }
  | { kind: "fading"; frame: MeasureRect; measurements: Measurements; until: number }
type Blueprint =
  | { kind: "empty" }
  | { kind: "pinned" | "drawing" | "fading"; frame: MeasureRect; measurements: Measurements }

const at = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY })
const number = (value: number) => String(Math.round(value * 10) / 10)
const dimensions = (rect: MeasureRect) => `${number(rect.width)} × ${number(rect.height)}`
const signature = (view: Blueprint) =>
  view.kind === "empty"
    ? "empty"
    : JSON.stringify([
        view.kind,
        view.frame,
        view.measurements.boxes.map(({ rect, padding, border, radius, scale, gap }) => [
          rect,
          padding,
          border,
          radius,
          scale,
          gap,
        ]),
        view.measurements.spaces,
      ])

/** A temporary measurement lens, or the existing selection pinned for fine-tuning. */
export function InspectionLayer({
  selected,
  onPick,
}: {
  selected: Element | null
  onPick: (element: Element) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture>({ kind: "idle" })
  const [view, setView] = useState<Blueprint>({ kind: "empty" })
  const clip = useId()

  useEffect(() => {
    let raf = 0
    let lastRead = 0
    let lastSignature = ""
    const tick = (now: number) => {
      const current = gesture.current
      if (current.kind === "fading" && now >= current.until) gesture.current = { kind: "idle" }
      if (
        now - lastRead >= 80 ||
        gesture.current.kind === "drawing" ||
        gesture.current.kind === "fading"
      ) {
        lastRead = now
        const active = gesture.current
        let next: Blueprint = { kind: "empty" }
        if (active.kind === "drawing") {
          const frame = measurementFrame(active.from, active.to)
          next = { kind: "drawing", frame, measurements: measureRegion(frame) }
        } else if (active.kind === "fading")
          next = { kind: "fading", frame: active.frame, measurements: active.measurements }
        else if (selected !== null) {
          const measured = measureBox(selected)
          if (measured !== null)
            next = {
              kind: "pinned",
              frame: measured.rect,
              measurements: measureRegion(measured.rect, selected),
            }
        }
        const changed = signature(next)
        if (changed !== lastSignature) {
          lastSignature = changed
          setView(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    const cancel = () => {
      const active = gesture.current
      gesture.current = { kind: "idle" }
      if (active.kind === "drawing" && surface.current?.hasPointerCapture(active.pointer))
        surface.current.releasePointerCapture(active.pointer)
      lastRead = 0
    }
    window.addEventListener("blur", cancel)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      cancel()
      window.removeEventListener("blur", cancel)
    }
  }, [selected])

  const cancelPointer = (event: PointerEvent) => {
    if (gesture.current.kind === "drawing" && gesture.current.pointer === event.pointerId)
      gesture.current = { kind: "idle" }
  }
  return (
    <div
      ref={surface}
      className="inspection-surface"
      data-inspection-state={view.kind}
      aria-hidden="true"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || gesture.current.kind === "drawing") return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        gesture.current = {
          kind: "drawing",
          pointer: event.pointerId,
          from: at(event),
          to: at(event),
        }
      }}
      onPointerMove={(event) => {
        const active = gesture.current
        if (active.kind === "drawing" && active.pointer === event.pointerId)
          gesture.current = { ...active, to: at(event) }
      }}
      onPointerUp={(event) => {
        const active = gesture.current
        if (active.kind !== "drawing" || active.pointer !== event.pointerId) return
        event.preventDefault()
        const point = at(event)
        if (Math.hypot(point.x - active.from.x, point.y - active.from.y) < 5) {
          gesture.current = { kind: "idle" }
          const leaf = leafAt(point.x, point.y)
          const element = leaf && meaningfulFrom(leaf, catalogNow())
          if (element !== null) onPick(element)
        } else {
          const frame = measurementFrame(active.from, point)
          gesture.current = {
            kind: "fading",
            frame,
            measurements: measureRegion(frame),
            until:
              performance.now() +
              (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320),
          }
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={cancelPointer}
    >
      {view.kind !== "empty" && (
        <svg className="inspection-blueprint" data-phase={view.kind} width="100%" height="100%">
          <defs>
            <clipPath id={clip}>
              <rect
                x={view.frame.left}
                y={view.frame.top}
                width={view.frame.width}
                height={view.frame.height}
              />
            </clipPath>
          </defs>
          <g clipPath={view.kind === "pinned" ? undefined : `url(#${clip})`}>
            <rect
              className="inspection-veil"
              x={view.frame.left}
              y={view.frame.top}
              width={view.frame.width}
              height={view.frame.height}
            />
            <BlueprintMarks
              measurements={view.measurements}
              frame={view.kind === "pinned" ? null : view.frame}
            />
          </g>
          <rect
            className="inspection-frame"
            x={view.frame.left}
            y={view.frame.top}
            width={view.frame.width}
            height={view.frame.height}
          />
          <SizeTag rect={view.frame} />
        </svg>
      )}
    </div>
  )
}

function SizeTag({ rect }: { rect: MeasureRect }) {
  const text = `${dimensions(rect)} px`
  const width = text.length * 6 + 12
  const left = Math.max(
    2,
    Math.min(window.innerWidth - width - 2, rect.left + rect.width / 2 - width / 2),
  )
  const top =
    rect.top + rect.height + 22 <= window.innerHeight
      ? rect.top + rect.height + 5
      : Math.max(2, rect.top - 22)
  return (
    <g className="inspection-size" data-measure="frame" transform={`translate(${left},${top})`}>
      <rect width={width} height={18} rx={3} />
      <text x={width / 2} y={12}>
        {text}
      </text>
    </g>
  )
}

function paddingBands(box: MeasuredBox): MeasureRect[] {
  const { rect: r, padding: p, border: b, scale } = box
  if (scale === null) return []
  const left = r.left + b[3] * scale.x
  const top = r.top + b[0] * scale.y
  const width = Math.max(0, r.width - (b[1] + b[3]) * scale.x)
  const height = Math.max(0, r.height - (b[0] + b[2]) * scale.y)
  return [
    { left, top, width, height: Math.min(height, p[0] * scale.y) },
    {
      left: left + Math.max(0, width - p[1] * scale.x),
      top,
      width: Math.min(width, p[1] * scale.x),
      height,
    },
    {
      left,
      top: top + Math.max(0, height - p[2] * scale.y),
      width,
      height: Math.min(height, p[2] * scale.y),
    },
    { left, top, width: Math.min(width, p[3] * scale.x), height },
  ]
}

/** Annotation density is bounded independently from how many boxes can be outlined. */
function BlueprintMarks({
  measurements,
  frame,
}: {
  measurements: Measurements
  frame: MeasureRect | null
}) {
  const labels: { x: number; y: number; width: number; text: string; kind: string }[] = []
  const place = (x: number, y: number, text: string, kind: string) => {
    if (labels.length >= 48) return
    const width = text.length * 6 + 8
    x = Math.max(2, Math.min(window.innerWidth - width - 2, x - width / 2))
    y = Math.max(2, Math.min(window.innerHeight - 17, y - 8))
    if (
      frame !== null &&
      (x < frame.left ||
        x + width > frame.left + frame.width ||
        y < frame.top ||
        y + 16 > frame.top + frame.height)
    )
      return
    if (
      labels.some(
        (label) =>
          x < label.x + label.width + 3 &&
          x + width + 3 > label.x &&
          y < label.y + 19 &&
          y + 19 > label.y,
      )
    )
      return
    labels.push({ x, y, width, text, kind })
  }
  const boxes = measurements.boxes.map((box, index) => {
    const { rect: r } = box
    const bands = paddingBands(box)
    bands.forEach((band, side) => {
      if (band.width > 0 && band.height > 0)
        place(
          band.left + band.width / 2,
          band.top + band.height / 2,
          `p ${number(box.padding[side] ?? 0)}`,
          "padding",
        )
    })
    if (box.scale !== null) {
      const corners = [
        [r.left + 23, r.top + 9],
        [r.left + r.width - 23, r.top + 9],
        [r.left + r.width - 23, r.top + r.height - 9],
        [r.left + 23, r.top + r.height - 9],
      ]
      box.radius.forEach((radius, corner) => {
        if (!radius || /^0(?:px|%)?(?:\s+0(?:px|%)?)?$/.test(radius)) return
        if (corner > 0 && radius === box.radius[0]) return
        const point = corners[corner]
        if (point && point[0] !== undefined && point[1] !== undefined)
          place(point[0], point[1], `r ${radius}`, "radius")
      })
    }
    if (box.gap !== null) place(r.left + r.width / 2, r.top + r.height - 9, `gap ${box.gap}`, "gap")
    if (index > 0) place(r.left + r.width / 2, r.top + r.height - 9, dimensions(r), "size")
    return (
      <g key={index}>
        <rect className="inspection-box" x={r.left} y={r.top} width={r.width} height={r.height} />
        {bands.map((band, side) => (
          <rect
            key={side}
            className="inspection-padding"
            data-measure="padding-band"
            data-value={box.padding[side]}
            x={band.left}
            y={band.top}
            width={band.width}
            height={band.height}
          />
        ))}
      </g>
    )
  })
  const spaces = measurements.spaces.map(({ rect: r, distance }, index) => {
    place(r.left + r.width / 2, r.top + r.height / 2, `space ${number(distance)}`, "space")
    return (
      <rect
        key={index}
        className="inspection-space"
        x={r.left}
        y={r.top}
        width={r.width}
        height={r.height}
      />
    )
  })
  return (
    <>
      {boxes}
      {spaces}
      {labels.map((label, index) => (
        <g
          key={index}
          className="inspection-label"
          data-measure={label.kind}
          data-value={label.text}
          transform={`translate(${label.x},${label.y})`}
        >
          <rect width={label.width} height={16} rx={3} />
          <text x={label.width / 2} y={11.5}>
            {label.text}
          </text>
        </g>
      ))}
    </>
  )
}

/** The selected values remain readable without interpreting the blueprint drawing. */
export function InspectionSummary({ target }: { target: Element }) {
  const [text, setText] = useState("")
  useEffect(() => {
    const update = () => {
      const measured = measureBox(target)
      const next =
        measured === null
          ? "Element is no longer visible."
          : [
              `${dimensions(measured.rect)} px`,
              `Padding ${measured.padding.map(number).join(" / ")} px`,
              ...(measured.gap === null ? [] : [`Gap ${measured.gap}`]),
              `Radius ${[...new Set(measured.radius)].join(" / ")}`,
            ].join(" · ")
      setText((current) => (current === next ? current : next))
    }
    update()
    const timer = setInterval(update, 160)
    return () => {
      clearInterval(timer)
    }
  }, [target])
  return (
    <output className="inspection-summary" aria-label="Selected element measurements">
      {text}
    </output>
  )
}
