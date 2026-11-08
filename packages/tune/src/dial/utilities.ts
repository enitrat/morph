import { isThemeToken, type TokenName, type Tokens } from "../core/design-system"
import { lengthOf } from "../core/display"
import { MULTIPLES, stepsFor } from "../core/edit"
import { normalizeValue, resolveToken } from "../core/graph"
import { type ThemeName } from "../core/config"

/** The rows of the Fine-tune panel, in the order a designer reads an element. */
export const GROUPS = ["Size", "Padding", "Gap", "Radius", "Fill", "Text", "Border"] as const
export type Group = (typeof GROUPS)[number]

type ScaleKind = "spacing" | "radius" | "color" | "font-size" | "border-width"

/** A Tailwind utility prefix the dials step, and the longhands its value sets. */
interface Family {
  prefix: string
  scale: ScaleKind
  group: Group
  label: string
  /** The first one is compared with the computed style to tell whether the class wins. */
  properties: readonly [string, ...string[]]
}

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const

const spacing = (prefix: string, label: string, properties: Family["properties"]): Family => ({
  prefix,
  scale: "spacing",
  group: prefix.startsWith("p") ? "Padding" : prefix.startsWith("gap") ? "Gap" : "Size",
  label,
  properties,
})

const radius = (
  prefix: string,
  label: string,
  [first, ...rest]: readonly [string, ...string[]],
): Family => ({
  prefix,
  scale: "radius",
  group: "Radius",
  label,
  properties: [`border-${first}-radius`, ...rest.map((corner) => `border-${corner}-radius`)],
})

const LISTED: readonly Family[] = [
  spacing("p", "Padding", ["padding-top", "padding-right", "padding-bottom", "padding-left"]),
  spacing("px", "Padding x", ["padding-inline-start", "padding-inline-end"]),
  spacing("py", "Padding y", ["padding-block-start", "padding-block-end"]),
  spacing("pt", "Padding top", ["padding-top"]),
  spacing("pr", "Padding right", ["padding-right"]),
  spacing("pb", "Padding bottom", ["padding-bottom"]),
  spacing("pl", "Padding left", ["padding-left"]),
  spacing("ps", "Padding start", ["padding-inline-start"]),
  spacing("pe", "Padding end", ["padding-inline-end"]),
  spacing("gap", "Gap", ["row-gap", "column-gap"]),
  spacing("gap-x", "Gap x", ["column-gap"]),
  spacing("gap-y", "Gap y", ["row-gap"]),
  spacing("w", "Width", ["width"]),
  spacing("h", "Height", ["height"]),
  spacing("size", "Size", ["width", "height"]),
  radius("rounded", "Radius", CORNERS),
  radius("rounded-t", "Radius top", ["top-left", "top-right"]),
  radius("rounded-b", "Radius bottom", ["bottom-left", "bottom-right"]),
  radius("rounded-l", "Radius left", ["top-left", "bottom-left"]),
  radius("rounded-r", "Radius right", ["top-right", "bottom-right"]),
  { prefix: "bg", scale: "color", group: "Fill", label: "Fill", properties: ["background-color"] },
  { prefix: "text", scale: "color", group: "Text", label: "Colour", properties: ["color"] },
  {
    prefix: "text",
    scale: "font-size",
    group: "Text",
    label: "Size",
    properties: ["font-size", "line-height"],
  },
  {
    prefix: "border",
    scale: "color",
    group: "Border",
    label: "Colour",
    properties: [
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
    ],
  },
  {
    prefix: "border",
    scale: "border-width",
    group: "Border",
    label: "Width",
    properties: [
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width",
    ],
  },
]

/** Longest prefix first, so `px-4` reads as `px` before `p`. */
const FAMILIES = LISTED.toSorted((a, b) => b.prefix.length - a.prefix.length)

const SPACING = [0, ...MULTIPLES]
const BORDER_WIDTHS = ["0", "", "2", "4", "8"]

/** The named steps Tailwind compiles from the tokens: radius names, font sizes, colour roles. */
export interface Scales {
  tokens: Tokens
  radius: readonly string[]
  fontSize: readonly string[]
  /** Roles with a Tailwind colour utility: `secondary` for a `@theme` `--color-secondary`. */
  colors: ReadonlySet<string>
}

/**
 * The steps of a Tailwind namespace: tokens `${prefix}<step>` declared in a `@theme` block, the
 * only place Tailwind compiles a utility from, that resolve to a length in the reference theme,
 * smallest first. `--radius-control`, declared in `:root`, compiles no `rounded-control`.
 */
function themeScale(tokens: Tokens, prefix: string): string[] {
  const [reference] = tokens.themes.list
  return [...tokens.graph.values()]
    .filter(
      (node) =>
        isThemeToken(node) &&
        node.name.startsWith(prefix) &&
        !node.name.slice(prefix.length).includes("--"),
    )
    .flatMap((node) => {
      const px = lengthOf(resolveToken(tokens, node.name, reference.name))
      return px === undefined ? [] : [{ name: node.name.slice(prefix.length), px }]
    })
    .toSorted((a, b) => a.px - b.px)
    .map((entry) => entry.name)
}

export function scalesOf(tokens: Tokens): Scales {
  const colors = new Set<string>()
  for (const node of tokens.graph.values())
    if (isThemeToken(node) && node.name.startsWith("--color-"))
      colors.add(node.name.slice("--color-".length))
  return {
    tokens,
    radius: themeScale(tokens, "--radius-"),
    fontSize: themeScale(tokens, "--text-"),
    colors,
  }
}

/** A class the dials can step: its family and the step it names. */
interface Utility {
  family: Family
  value: string
}

function accepts(scales: Scales, kind: ScaleKind, value: string): boolean {
  if (kind === "spacing") return value === "px" || /^\d+(?:\.\d+)?$/.test(value)
  if (kind === "radius") return scales.radius.includes(value)
  if (kind === "font-size") return scales.fontSize.includes(value)
  if (kind === "border-width") return BORDER_WIDTHS.includes(value)
  return scales.colors.has(value)
}

/** `px-4` → padding x at 4; `undefined` for a class with a variant, modifier or arbitrary value. */
export function utilityOf(className: string, scales: Scales): Utility | undefined {
  if (!/^[a-z][\w.-]*$/.test(className)) return undefined
  for (const family of FAMILIES) {
    if (className === family.prefix && family.scale === "border-width") return { family, value: "" }
    if (!className.startsWith(`${family.prefix}-`)) continue
    const value = className.slice(family.prefix.length + 1)
    if (accepts(scales, family.scale, value)) return { family, value }
  }
  return undefined
}

export const classOf = ({ family, value }: Utility) =>
  value === "" ? family.prefix : `${family.prefix}-${value}`

/**
 * What the class sets, longhand by longhand. A theme token is read through its declaration, since
 * Tailwind inlines `@theme inline` tokens and drops unused ones, so `var(--color-x)` may not exist.
 */
export function declarationsOf({ family, value }: Utility, scales: Scales): Record<string, string> {
  const declared = (name: TokenName) =>
    scales.tokens.graph.get(name)?.declarations[0]?.value ?? `var(${name})`
  const expr = (property: string): string => {
    if (family.scale === "spacing") {
      if (value === "px") return "1px"
      return value === "0" ? "0px" : `calc(var(--spacing) * ${value})`
    }
    if (family.scale === "radius") return declared(`--radius-${value}`)
    if (family.scale === "border-width") return `${value === "" ? "1" : value}px`
    if (family.scale === "font-size")
      return declared(
        property === "line-height" ? `--text-${value}--line-height` : `--text-${value}`,
      )
    return declared(`--color-${value}`)
  }
  return Object.fromEntries(family.properties.map((property) => [property, expr(property)]))
}

/** The colour roles a role steps to, in `stepsFor`'s order, that have a utility of their own. */
function colorSteps(scales: Scales, role: string, theme: ThemeName): string[] {
  const alias = scales.tokens.graph.get(`--color-${role}`)?.declarations[0]?.value ?? ""
  const read = /^var\(--([\w-]+)\)$/.exec(normalizeValue(alias))?.[1]
  if (read === undefined) return [role]
  const roles = stepsFor(scales.tokens, `var(--${read})`, theme).flatMap((step) => {
    const name = /^var\(--([\w-]+)\)$/.exec(step)?.[1]
    if (name === undefined) return []
    if (name === read) return [role]
    return scales.colors.has(name) ? [name] : []
  })
  return [...new Set(roles.includes(role) ? roles : [role, ...roles])]
}

/** Every step of the class's scale, the class itself included, as classes. */
export function stepsOf(utility: Utility, scales: Scales, theme: ThemeName): string[] {
  const { family, value } = utility
  const values = (() => {
    if (family.scale === "spacing") {
      const current = value === "px" ? [] : [Number(value)]
      return [...new Set([...SPACING, ...current])].toSorted((a, b) => a - b).map(String)
    }
    if (family.scale === "radius") return [...scales.radius]
    if (family.scale === "font-size") return [...scales.fontSize]
    if (family.scale === "border-width") return BORDER_WIDTHS
    return colorSteps(scales, value, theme)
  })()
  const all = values.includes(value) ? values : [value, ...values]
  return all.map((step) => classOf({ family, value: step }))
}

/** Why swapping `from` for `to` is not a dial step, or `undefined` when it is one. */
export function swapError(from: string, to: string, scales: Scales): string | undefined {
  const a = utilityOf(from, scales)
  const b = utilityOf(to, scales)
  if (a === undefined) return `${from} is not a utility the dials step`
  if (b === undefined) return `${to} is not a utility the dials step`
  if (a.family !== b.family) return `${from} and ${to} set different properties`
  return undefined
}
