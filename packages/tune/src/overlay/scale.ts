import {
  activationOf,
  fromWire,
  isThemeToken,
  themeNamed,
  type Tokens,
} from "../core/design-system"
import { type ThemeName } from "../core/config"
import { lengthOf } from "../core/display"
import { resolve, resolveToken } from "../core/graph"
import { scalesOf } from "../dial/utilities"
import { probe } from "../inspector/probe"
import { loadTokens } from "./catalog"

/** A named step of a length scale. */
export interface Step {
  name: string
  px: number
}

/** The design system's scales as the inspector matches computed values against them. */
export interface Scales {
  space: readonly Step[]
  radius: readonly Step[]
  /** Computed colour, as `getComputedStyle` writes it, to its token's role. */
  colors: ReadonlyMap<string, string>
}

export const NO_SCALES: Scales = { space: [], radius: [], colors: new Map() }

/** Tailwind's spacing multiples, the steps its `p-*` and `gap-*` utilities compile. */
const MULTIPLES = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48,
  52, 56, 60, 64, 72, 80, 96,
]

/** The step of `scale` a value sits on, to the half pixel; `null` when it is off the scale. */
export function tokenAt(px: number, scale: readonly Step[]): string | null {
  return scale.find((step) => Math.abs(step.px - px) < 0.5)?.name ?? null
}

/** The step of `scale` nearest a value; `null` for an empty scale. */
export function nearestTo(px: number, scale: readonly Step[]): Step | null {
  let best: Step | null = null
  for (const step of scale)
    if (best === null || Math.abs(step.px - px) < Math.abs(best.px - px)) best = step
  return best
}

/** How a value reads against its scale: on a token, off it with the nearest, or unscaled. */
export type Match =
  | { kind: "token"; name: string }
  | { kind: "off"; near: string }
  | { kind: "none" }

/** Zero is never off the scale, and nothing is when the design system has no scale for it. */
export function matchOf(px: number, scale: readonly Step[]): Match {
  if (px === 0 || scale.length === 0) return { kind: "none" }
  const name = tokenAt(px, scale)
  if (name !== null) return { kind: "token", name }
  const near = nearestTo(px, scale)
  return near === null ? { kind: "none" } : { kind: "off", near: near.name }
}

/**
 * A length the page declares on its root. Tailwind's own theme (`--spacing`, `--radius-lg`) is not
 * in the app's token files, but Tailwind emits the variables the page uses.
 */
const pageLength = (name: string) =>
  lengthOf(getComputedStyle(document.documentElement).getPropertyValue(name).trim())

/**
 * `28 px` for `calc(var(--spacing) * 7)`, reading each variable off the page; `null` when it is
 * not a length there. Tailwind's own theme variables are only on the page, not in the token files.
 */
export function pagePx(expr: string): string | null {
  if (!expr.includes("var(")) return null
  const root = getComputedStyle(document.documentElement)
  const px = lengthOf(
    expr.replaceAll(
      /var\((--[\w-]+)\)/g,
      (_, name: string) => root.getPropertyValue(name).trim() || "x",
    ),
  )
  return px === undefined ? null : `${Math.round(px * 100) / 100} px`
}

const TAILWIND_RADII = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]

/** Spacing: Tailwind's `--spacing` multiples, plus any `--space-*` or `--spacing-*` token. */
function spaceOf(tokens: Tokens, theme: ThemeName): Step[] {
  const steps: Step[] = []
  const unit = tokens.graph.has("--spacing")
    ? lengthOf(resolveToken(tokens, "--spacing", theme))
    : pageLength("--spacing")
  if (unit !== undefined && unit > 0)
    for (const n of MULTIPLES) steps.push({ name: `space-${n}`, px: n * unit })
  for (const node of tokens.graph.values()) {
    const match = /^--(space|spacing)-([\w.]+)$/.exec(node.name)
    const px = match ? lengthOf(resolveToken(tokens, node.name, theme)) : undefined
    if (match && px !== undefined) steps.push({ name: `${match[1]}-${match[2]}`, px })
  }
  return steps.toSorted((a, b) => a.px - b.px)
}

function radiusOf(tokens: Tokens, theme: ThemeName): Step[] {
  const declared = scalesOf(tokens).radius.flatMap((name) => {
    const px = lengthOf(resolveToken(tokens, `--radius-${name}`, theme))
    return px === undefined ? [] : [{ name: `radius-${name}`, px }]
  })
  if (declared.length > 0) return declared
  return TAILWIND_RADII.flatMap((name) => {
    const px = pageLength(`--radius-${name}`)
    return px === undefined ? [] : [{ name: `radius-${name}`, px }]
  })
}

/** Each colour token, computed the way the page computes it, so a page colour finds its role. */
function colorsOf(tokens: Tokens, theme: ThemeName): Map<string, string> {
  const root = activationOf(themeNamed(tokens.themes, theme))
  const colors = new Map<string, string>()
  for (const node of tokens.graph.values()) {
    if (!isThemeToken(node) || !node.name.startsWith("--color-")) continue
    const declared = node.declarations[0]?.value
    if (declared === undefined) continue
    const computed = probe("color", resolve(tokens, declared, theme), root)
    if (computed !== "" && !colors.has(computed))
      colors.set(computed, node.name.slice("--color-".length))
  }
  return colors
}

/** The scales for `theme`, or none while the bridge cannot answer. */
export async function loadScales(theme: ThemeName): Promise<Scales> {
  const answer = await loadTokens()
  if (!answer.ok) return NO_SCALES
  const { tokens } = fromWire(answer.value)
  return {
    space: spaceOf(tokens, theme),
    radius: radiusOf(tokens, theme),
    colors: colorsOf(tokens, theme),
  }
}
