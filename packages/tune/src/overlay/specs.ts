import { type Match, matchOf, type Scales } from "./scale"

/** Top, right, bottom, left. */
export type Quad = readonly [number, number, number, number]

/** What the inspector reads off one element, in CSS pixels and computed colours. */
export interface Spec {
  width: number
  height: number
  display: string
  padding: Quad
  margin: Quad
  border: Quad
  /** `null` outside flex and grid. */
  gap: number | null
  radius: number
  font: { size: number; lineHeight: string; weight: string; family: string; letterSpacing: string }
  /** The text colour, only when the element shows text of its own. */
  text: string | null
  fill: string | null
  stroke: string | null
}

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
