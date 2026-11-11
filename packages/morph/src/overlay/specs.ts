import { z } from "zod"

import { type Match, matchOf, type Scales } from "./scale"

const Quad = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly()
/** Top, right, bottom, left. */
export type Quad = z.infer<typeof Quad>

/** Computed browser measurements, also validated when restoring a saved reference. */
export const Spec = z.object({
  width: z.number(),
  height: z.number(),
  display: z.string(),
  padding: Quad,
  margin: Quad,
  border: Quad,
  gap: z.number().nullable(),
  radius: z.number(),
  font: z.object({
    size: z.number(),
    lineHeight: z.string(),
    weight: z.string(),
    family: z.string(),
    letterSpacing: z.string(),
  }),
  text: z.string().nullable(),
  fill: z.string().nullable(),
  stroke: z.string().nullable(),
})
/** One element's visible dimensions, spacing, colors, and typography. */
export type Spec = z.infer<typeof Spec>

const px = (value: string) => Number.parseFloat(value) || 0

const painted = (color: string) =>
  color !== "" &&
  color !== "transparent" &&
  !/^rgba\(.*,\s*0\)$/.test(color) &&
  !color.endsWith(" / 0)")

/** The element's own visible text, not its children's. */
export const ownText = (element: Element) =>
  [...element.childNodes]
    .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    ?.textContent?.trim() ?? null

export function specOf(element: Element): Spec {
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const quad = (name: (side: string) => string): Quad => [
    px(style.getPropertyValue(name("top"))),
    px(style.getPropertyValue(name("right"))),
    px(style.getPropertyValue(name("bottom"))),
    px(style.getPropertyValue(name("left"))),
  ]
  const border = quad((side) => `border-${side}-width`)
  const layout = /flex|grid/.test(style.display)
  return {
    width: rect.width,
    height: rect.height,
    display: style.display,
    padding: quad((side) => `padding-${side}`),
    margin: quad((side) => `margin-${side}`),
    border,
    gap: layout ? px(style.rowGap === "normal" ? style.columnGap : style.rowGap) : null,
    radius: px(style.borderTopLeftRadius),
    font: {
      size: px(style.fontSize),
      lineHeight: style.lineHeight,
      weight: style.fontWeight,
      family: style.fontFamily.split(",")[0]?.replaceAll(/["']/g, "").trim() ?? "",
      letterSpacing: style.letterSpacing,
    },
    text: ownText(element) === null ? null : style.color,
    fill: painted(style.backgroundColor) ? style.backgroundColor : null,
    stroke:
      border.some((width) => width > 0) && painted(style.borderTopColor)
        ? style.borderTopColor
        : null,
  }
}

/** A value the element uses and how it reads against the design system. */
export type Use =
  | { kind: "length"; prop: string; px: number; match: Match }
  | { kind: "color"; prop: string; css: string; role: string | null }

/** The spacing, radius and colours the element uses, each matched to its token or flagged. */
export function usesOf(spec: Spec, scales: Scales): Use[] {
  const uses: Use[] = []
  for (const value of new Set(spec.padding.filter((side) => side > 0)))
    uses.push({ kind: "length", prop: "padding", px: value, match: matchOf(value, scales.space) })
  if (spec.gap)
    uses.push({ kind: "length", prop: "gap", px: spec.gap, match: matchOf(spec.gap, scales.space) })
  if (spec.radius > 0 && spec.radius < 500)
    uses.push({
      kind: "length",
      prop: "radius",
      px: spec.radius,
      match: matchOf(spec.radius, scales.radius),
    })
  const colors: [string, string | null][] = [
    ["text", spec.text],
    ["fill", spec.fill],
    ["border", spec.stroke],
  ]
  for (const [prop, css] of colors)
    if (css !== null) uses.push({ kind: "color", prop, css, role: scales.colors.get(css) ?? null })
  return uses
}

/** `#1c1917` for an opaque `rgb()`, else the computed text as it is. */
export function hexOf(css: string): string {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css)
  if (match === null || (match[4] !== undefined && Number(match[4]) < 1)) return css
  return `#${[match[1], match[2], match[3]].map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`
}

export const fmt = (value: number) => String(Math.round(value * 10) / 10)

/** `88 0 72 0` collapsed the way CSS shorthand would write it. */
export function quadText([top, right, bottom, left]: Quad): string {
  if (top === bottom && right === left)
    return top === right ? fmt(top) : `${fmt(top)} ${fmt(right)}`
  return [top, right, bottom, left].map(fmt).join(" ")
}

/** One measured difference between a reference and the current visible element. */
export type Change =
  | { kind: "length"; label: string; was: number; now: number; match: Match }
  | { kind: "color"; label: string; was: string | null; now: string | null; role: string | null }
  | { kind: "text"; label: string; was: string; now: string }

const SIDES = ["top", "right", "bottom", "left"] as const

/**
 * What differs from a saved reference measurement: spacing, size, radius,
 * type and colours, each length matched against its scale so an off-scale value shows.
 */
export function deltaOf(was: Spec, now: Spec, scales: Scales): Change[] {
  const changes: Change[] = []
  const length = (label: string, a: number, b: number, scale: Scales["space"] | null) => {
    if (Math.abs(a - b) >= 0.5)
      changes.push({
        kind: "length",
        label,
        was: a,
        now: b,
        match: scale === null ? { kind: "none" } : matchOf(b, scale),
      })
  }
  const quad = (label: string, a: Quad, b: Quad) => {
    const [at, ar, ab, al] = a
    const [bt, br, bb, bl] = b
    if (at === ab && bt === bb) length(`${label} y`, at, bt, scales.space)
    else
      for (const side of [0, 2])
        length(`${label} ${SIDES[side]}`, a[side] ?? 0, b[side] ?? 0, scales.space)
    if (ar === al && br === bl) length(`${label} x`, ar, br, scales.space)
    else
      for (const side of [3, 1])
        length(`${label} ${SIDES[side]}`, a[side] ?? 0, b[side] ?? 0, scales.space)
  }
  quad("padding", was.padding, now.padding)
  length("gap", was.gap ?? 0, now.gap ?? 0, scales.space)
  quad("margin", was.margin, now.margin)
  length("radius", was.radius, now.radius, now.radius >= 500 ? null : scales.radius)
  length("width", was.width, now.width, null)
  length("height", was.height, now.height, null)
  length("font size", was.font.size, now.font.size, null)
  if (was.font.weight !== now.font.weight)
    changes.push({ kind: "text", label: "weight", was: was.font.weight, now: now.font.weight })
  if (was.display !== now.display)
    changes.push({ kind: "text", label: "display", was: was.display, now: now.display })
  const color = (label: string, a: string | null, b: string | null) => {
    if (a !== b)
      changes.push({
        kind: "color",
        label,
        was: a,
        now: b,
        role: b === null ? null : (scales.colors.get(b) ?? null),
      })
  }
  color("fill", was.fill, now.fill)
  color("text", was.text, now.text)
  color("border", was.stroke, now.stroke)
  return changes
}
