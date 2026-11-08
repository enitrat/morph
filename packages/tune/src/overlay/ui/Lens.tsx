import { type ReactNode } from "react"

import { isTune } from "../../inspector/target"
import { type Box, boxOf } from "../place"
import { matchOf, type Scales, type Step } from "../scale"
import { fmt, specOf } from "../specs"
import { nameOf } from "../tree"
import { type Area, Outline, Tag } from "./PageLayer"

type Line = { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
type Label = { x: number; y: number; px: number; scale: readonly Step[] }

const rectOf = (element: Element) => boxOf(element.getBoundingClientRect())
const visible = (box: Box) => box.right > box.left && box.bottom > box.top

/** A measured distance: a ruler with end caps and its value, named by its token. */
function ruler(
  lines: Line[],
  labels: Label[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  scale: readonly Step[],
) {
  if (px < 0.5) return
  lines.push({ x1, y1, x2, y2 })
  if (x1 === x2)
    lines.push({ x1: x1 - 3, y1, x2: x1 + 3, y2: y1 }, { x1: x2 - 3, y1: y2, x2: x2 + 3, y2 })
  else lines.push({ x1, y1: y1 - 3, x2: x1, y2: y1 + 3 }, { x1: x2, y1: y2 - 3, x2, y2: y2 + 3 })
  labels.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, px, scale })
}

/** Padding bands and the gaps between flow children, hatched, with their values. */
function padding(subject: Element, box: Box, scales: Scales, labels: Label[]): ReactNode[] {
  const spec = specOf(subject)
  const [bt, br, bb, bl] = spec.border
  const [pt, pr, pb, pl] = spec.padding
  const inner = {
    left: box.left + bl,
    top: box.top + bt,
    right: box.right - br,
    bottom: box.bottom - bb,
  }
  const bands: [number, number, number, number, number][] = [
    [inner.left, inner.top, inner.right - inner.left, pt, pt],
    [inner.left, inner.bottom - pb, inner.right - inner.left, pb, pb],
    [inner.left, inner.top + pt, pl, inner.bottom - inner.top - pt - pb, pl],
    [inner.right - pr, inner.top + pt, pr, inner.bottom - inner.top - pt - pb, pr],
  ]
  const nodes: ReactNode[] = []
  bands.forEach(([x, y, w, h, value], i) => {
    if (value < 0.5 || w < 1 || h < 1) return
    nodes.push(
      <div
        key={`p${i}`}
        className="hatch absolute"
        style={{ left: x, top: y, width: w, height: h }}
      />,
    )
    if (Math.min(w, h) >= 10 || value >= 10)
      labels.push({ x: x + w / 2, y: y + h / 2, px: value, scale: scales.space })
  })
  if (!spec.gap) return nodes
  const kids = [...subject.children]
    .filter((child) => !isTune(child) && getComputedStyle(child).position !== "absolute")
    .map(rectOf)
    .filter(visible)
  for (let i = 0; i < kids.length - 1; i++) {
    const a = kids[i] as Box
    const c = kids[i + 1] as Box
    let gap: [number, number, number, number, number] | null = null
    if (c.left >= a.right - 1) {
      const top = Math.max(a.top, c.top)
      const bottom = Math.min(a.bottom, c.bottom)
      if (bottom > top && c.left - a.right > 0.5)
        gap = [a.right, top, c.left - a.right, bottom - top, c.left - a.right]
    } else if (c.top >= a.bottom - 1) {
      const left = Math.max(a.left, c.left)
      const right = Math.min(a.right, c.right)
      if (right > left && c.top - a.bottom > 0.5)
        gap = [left, a.bottom, right - left, c.top - a.bottom, c.top - a.bottom]
    }
    if (gap === null) continue
    const [x, y, w, h, value] = gap
    nodes.push(
      <div
        key={`g${i}`}
        className="hatch absolute opacity-80"
        style={{ left: x, top: y, width: w, height: h }}
      />,
    )
    labels.push({ x: x + w / 2, y: y + h / 2, px: value, scale: scales.space })
  }
  return nodes
}

/** Distances from the subject to its nearest sibling on each side, else to its parent's inner edge. */
function around(
  subject: Element,
  box: Box,
  scales: Scales,
  lines: Line[],
  labels: Label[],
): ReactNode[] {
  const parent = subject.parentElement
  if (parent === null || parent === document.body) return []
  const siblings = [...parent.children]
    .filter((other) => other !== subject && !isTune(other))
    .map(rectOf)
    .filter(visible)
  const outer = rectOf(parent)
  const edge = Number.parseFloat(getComputedStyle(parent).borderTopWidth) || 0
  const cx = Math.max(0, Math.min(innerWidth, (box.left + box.right) / 2))
  const cy = Math.max(0, Math.min(innerHeight, (box.top + box.bottom) / 2))
  const across = (s: Box) => s.right > box.left && s.left < box.right
  const level = (s: Box) => s.bottom > box.top && s.top < box.bottom
  const nearest = (list: Box[], by: (s: Box) => number) =>
    list.reduce<Box | null>((best, s) => (best === null || by(s) < by(best) ? s : best), null)
  const up = nearest(
    siblings.filter((s) => across(s) && s.bottom <= box.top + 0.5),
    (s) => box.top - s.bottom,
  )
  const down = nearest(
    siblings.filter((s) => across(s) && s.top >= box.bottom - 0.5),
    (s) => s.top - box.bottom,
  )
  const left = nearest(
    siblings.filter((s) => level(s) && s.right <= box.left + 0.5),
    (s) => box.left - s.right,
  )
  const right = nearest(
    siblings.filter((s) => level(s) && s.left >= box.right - 0.5),
    (s) => s.left - box.right,
  )
  const top = up ? up.bottom : outer.top + edge
  const bottom = down ? down.top : outer.bottom - edge
  const start = left ? left.right : outer.left + edge
  const end = right ? right.left : outer.right - edge
  ruler(lines, labels, cx, top, cx, box.top, box.top - top, scales.space)
  ruler(lines, labels, cx, box.bottom, cx, bottom, bottom - box.bottom, scales.space)
  ruler(lines, labels, start, cy, box.left, cy, box.left - start, scales.space)
  ruler(lines, labels, box.right, cy, end, cy, end - box.right, scales.space)
  const nodes = [up, down, left, right].flatMap((s, i) =>
    s ? [<Outline key={`s${i}`} box={s} tone="measure" />] : [],
  )
  if (!up || !down || !left || !right)
    nodes.push(
      <div key="parent" className="opacity-50">
        <Outline box={outer} tone="measure" />
      </div>,
    )
  return nodes
}

/** Redlines between the selection and another element: insets when one holds the other, else gaps. */
function between(a: Box, b: Box, scales: Scales, lines: Line[], labels: Label[]) {
  const holds = (o: Box, i: Box) =>
    i.left >= o.left - 0.5 &&
    i.right <= o.right + 0.5 &&
    i.top >= o.top - 0.5 &&
    i.bottom <= o.bottom + 0.5
  const [outer, inner] = holds(b, a) ? [b, a] : holds(a, b) ? [a, b] : [null, null]
  if (outer && inner) {
    const cx = (inner.left + inner.right) / 2
    const cy = (inner.top + inner.bottom) / 2
    ruler(lines, labels, cx, outer.top, cx, inner.top, inner.top - outer.top, scales.space)
    ruler(
      lines,
      labels,
      cx,
      inner.bottom,
      cx,
      outer.bottom,
      outer.bottom - inner.bottom,
      scales.space,
    )
    ruler(lines, labels, outer.left, cy, inner.left, cy, inner.left - outer.left, scales.space)
    ruler(lines, labels, inner.right, cy, outer.right, cy, outer.right - inner.right, scales.space)
    return
  }
  const [vt, vb] = [Math.max(a.top, b.top), Math.min(a.bottom, b.bottom)]
  const [hl, hr] = [Math.max(a.left, b.left), Math.min(a.right, b.right)]
  const y = vb > vt ? (vt + vb) / 2 : (a.top + a.bottom) / 2
  const x = hr > hl ? (hl + hr) / 2 : (a.left + a.right) / 2
  if (b.left >= a.right) {
    ruler(lines, labels, a.right, y, b.left, y, b.left - a.right, scales.space)
    if (!(vb > vt))
      lines.push({ x1: b.left, y1: y, x2: b.left, y2: (b.top + b.bottom) / 2, dashed: true })
  } else if (a.left >= b.right) {
    ruler(lines, labels, b.right, y, a.left, y, a.left - b.right, scales.space)
    if (!(vb > vt))
      lines.push({ x1: b.right, y1: y, x2: b.right, y2: (b.top + b.bottom) / 2, dashed: true })
  }
  if (b.top >= a.bottom) {
    ruler(lines, labels, x, a.bottom, x, b.top, b.top - a.bottom, scales.space)
    if (!(hr > hl))
      lines.push({ x1: x, y1: b.top, x2: (b.left + b.right) / 2, y2: b.top, dashed: true })
  } else if (a.top >= b.bottom) {
    ruler(lines, labels, x, b.bottom, x, a.top, a.top - b.bottom, scales.space)
    if (!(hr > hl))
      lines.push({ x1: x, y1: b.bottom, x2: (b.left + b.right) / 2, y2: b.bottom, dashed: true })
  }
}

function Value({ label }: { label: Label }) {
  const match = matchOf(label.px, label.scale)
  return (
    <div
      className={`tnum absolute flex h-[17px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 font-mono text-[10.5px] font-semibold shadow-[0_1px_3px_rgb(0_0_0/0.25)] ${
        match.kind === "off" ? "bg-warn text-on-warn" : "bg-measure text-white"
      }`}
      style={{ left: label.x, top: label.y }}
    >
      {fmt(label.px)}
      {match.kind === "token" && <i className="font-medium not-italic opacity-75">{match.name}</i>}
      {match.kind === "off" && <i className="font-medium not-italic opacity-75">≈ {match.near}</i>}
    </div>
  )
}

/** The measuring lens over whatever is under the pointer. */
export function Lens({
  subject,
  selected,
  scales,
  area,
}: {
  subject: Element
  selected: Element | null
  scales: Scales
  area: Area
}) {
  const box = rectOf(subject)
  const lines: Line[] = []
  const labels: Label[] = []
  let nodes: ReactNode[]
  if (selected !== null && selected !== subject && selected.isConnected) {
    const other = rectOf(selected)
    between(other, box, scales, lines, labels)
    nodes = [<Outline key="s" box={box} tone="measure" />]
  } else {
    nodes = [
      <Outline key="s" box={box} tone="measure" />,
      ...padding(subject, box, scales, labels),
      ...around(subject, box, scales, lines, labels),
    ]
  }
  const radius = specOf(subject).radius
  const rmatch = matchOf(radius, scales.radius)
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483641] overflow-hidden">
      {nodes}
      <svg className="absolute inset-0 size-full overflow-visible">
        {lines.map((line, i) => (
          <line
            key={i}
            {...line}
            stroke="var(--measure)"
            strokeWidth={1}
            strokeDasharray={line.dashed ? "3 3" : undefined}
          />
        ))}
      </svg>
      {labels.map((label, i) => (
        <Value key={i} label={label} />
      ))}
      <Tag box={box} area={area} tone="measure">
        {nameOf(subject)}
        <span className="tnum font-mono text-[10px] opacity-70">
          {fmt(box.right - box.left)}×{fmt(box.bottom - box.top)}
        </span>
        {radius > 0 && radius < 500 && (
          <span className="font-mono text-[10px] opacity-70">
            r{fmt(radius)}
            {rmatch.kind === "token" ? ` ${rmatch.name}` : ""}
          </span>
        )}
      </Tag>
    </div>
  )
}
