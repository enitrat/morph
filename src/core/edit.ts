import { lightness, parseColor } from "./color"
import { type ThemeName } from "./config"
import {
  declarationFor,
  isUtilityAlias,
  type Scope,
  type TokenName,
  type TokenNode,
  type Tokens,
} from "./design-system"
import { chainOf, nodeOf, normalizeValue, referencesOf, resolve } from "./graph"

export interface TokenEdit {
  token: TokenName
  scope: Scope
  /** A token expression: `var(--neutral-700)`, or a `color-mix()` of tokens. Never a literal. */
  to: string
}

export interface Variant {
  id: string
  title: string
  /** One sentence in the designer's words: what changes and why it answers the description. */
  rationale: string
  edits: readonly TokenEdit[]
}

const LITERAL_UNITS = /\d(?:px|rem|em|ms|s|deg)\b/

/** The file `scope`'s write would land in, when the repo does not own it. */
function foreignFile(tokens: Tokens, node: TokenNode, scope: Scope): string | undefined {
  const written = scope === "all" ? node.declarations : [declarationFor(tokens, node, scope)]
  const owned = new Set(tokens.files.filter((file) => file.owned).map((file) => file.path))
  return written.find((entry) => !owned.has(entry.file))?.file
}

/** Why `edit` may not write one theme apart from the others. */
function splitError(tokens: Tokens, node: TokenNode, edit: TokenEdit): string | undefined {
  if (edit.scope === "all") return undefined
  if (!tokens.themes.list.some((theme) => theme.name === edit.scope))
    return `${edit.scope} is not a theme`
  if (node.tier === "component")
    return `${edit.token} is a component token and never splits by theme; edit a role instead`
  if (node.declarations.every((entry) => entry.block === "shared"))
    return `${edit.token} has one value for every theme; edit it for all of them`
  return undefined
}

/** Why `edit` breaks a ds rule, or `undefined` when it is a legal edit. */
export function editError(tokens: Tokens, edit: TokenEdit): string | undefined {
  const { graph, themes } = tokens
  const node = graph.get(edit.token)
  if (!node) return `${edit.token} is not a ds token`
  if (node.tier === "primitive") return `${edit.token} is a primitive; edit the role that reads it`
  const to = normalizeValue(edit.to)
  if (to.includes("#") || LITERAL_UNITS.test(to)) return `${to} holds a literal; use a token`
  const stripped = to.replaceAll(/var\(--[\w-]+\)/g, "")
  if (!/^[\s\w%.,()+*/-]*$/.test(stripped)) return `${to} is not a token expression`
  const refs = referencesOf(to)
  if (refs.length === 0) return `${to} reads no token`
  for (const ref of refs) {
    const read = graph.get(ref)
    if (!read) return `${ref} is not a ds token`
    if (ref === edit.token) return `${edit.token} cannot read itself`
    if (node.tier === "component" && read.tier === "primitive") {
      return `${edit.token} is a component token; point it at a role, not ${ref}`
    }
  }
  const split = splitError(tokens, node, edit)
  if (split !== undefined) return split
  const foreign = foreignFile(tokens, node, edit.scope)
  if (foreign) return `${edit.token} is declared in ${foreign}, which this repo does not own`
  const read: readonly ThemeName[] =
    edit.scope === "all" ? themes.list.map((theme) => theme.name) : [edit.scope]
  if (read.every((theme) => declarationFor(tokens, node, theme).value === to)) {
    return `${edit.token} already reads ${to}`
  }
  return undefined
}

export function assertEdits(tokens: Tokens, edits: readonly TokenEdit[]): void {
  for (const edit of edits) {
    const error = editError(tokens, edit)
    if (error) throw new Error(error)
  }
}

export function currentValue(tokens: Tokens, token: TokenName, theme: ThemeName): string {
  return declarationFor(tokens, nodeOf(tokens.graph, token), theme).value
}

/** The multiples a `calc(var(--spacing) * n)` value steps through, the ds spacing scale's. */
export const MULTIPLES = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56,
  64, 72, 80, 96,
]
const SCALED = /^calc\(var\((--[\w-]+)\) \* ([\d.]+)\)$/

export const SIZES = ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]

function suffixRank(name: string): number | undefined {
  const suffix = name.split("-").at(-1) ?? ""
  if (/^\d+$/.test(suffix)) return Number(suffix)
  const size = SIZES.indexOf(suffix)
  return size === -1 ? undefined : 10_000 + size
}

const pxOf = (value: string): number | undefined => {
  const match = /^(\d*\.?\d+)(px|rem)$/.exec(value)
  return match ? Number(match[1]) * (match[2] === "rem" ? 16 : 1) : undefined
}

/**
 * For a role outside any ranked scale (`--radius-control`): the roles of its file and prefix
 * that resolve to a length, smallest first, one per length with `role` first among equals.
 */
function siblingRoles(tokens: Tokens, role: TokenName, theme: ThemeName): string[] | undefined {
  const { graph } = tokens
  const node = nodeOf(graph, role)
  const file = node.declarations[0]?.file
  const prefix = role.replace(/-[^-]+$/, "-")
  if (node.tier !== "semantic" || pxOf(resolve(tokens, `var(${role})`, theme)) === undefined) {
    return undefined
  }
  const byLength = new Map<number, TokenName>()
  for (const sibling of [node, ...graph.values()]) {
    if (sibling.tier !== "semantic" || sibling.declarations[0]?.file !== file) continue
    if (!sibling.name.startsWith(prefix) || sibling.name.slice(prefix.length).includes("-"))
      continue
    const px = pxOf(resolve(tokens, `var(${sibling.name})`, theme))
    if (px !== undefined && !byLength.has(px)) byLength.set(px, sibling.name)
  }
  if (byLength.size < 2) return undefined
  return [...byLength].toSorted(([a], [b]) => a - b).map(([, name]) => `var(${name})`)
}

/**
 * The ramp `to` reads (a colour ramp darkest first), the spacing scale, every solid colour role
 * darkest first, or the sibling length roles.
 */
export function stepsFor(tokens: Tokens, to: string, theme: ThemeName): string[] {
  const { graph } = tokens
  const scaled = SCALED.exec(normalizeValue(to))
  if (scaled) {
    const [, unit = "", factor = ""] = scaled
    return [...new Set([...MULTIPLES, Number(factor)])]
      .toSorted((a, b) => a - b)
      .map((multiple) => `calc(var(${unit}) * ${multiple})`)
  }
  const match = /^var\((--[\w-]+)\)$/.exec(normalizeValue(to))
  if (!match) return [to]
  const read = nodeOf(graph, match[1] ?? "")
  const file = read.declarations[0]?.file
  const prefix = read.name.replace(/-[^-]+$/, "-")
  const family = [...graph.values()].filter(
    (node) =>
      node.declarations[0]?.file === file &&
      node.name.startsWith(prefix) &&
      !node.name.slice(prefix.length).includes("-") &&
      suffixRank(node.name) !== undefined,
  )
  const color = (name: TokenName) => parseColor(resolve(tokens, `var(${name})`, theme))
  // A colour ramp runs darker to lighter like the roles below, whichever way its suffixes count.
  const rank = (name: TokenName) => {
    const rgb = color(name)
    return rgb === undefined ? (suffixRank(name) ?? 0) : lightness(rgb)
  }
  if (family.length >= 3 && suffixRank(read.name) !== undefined) {
    return family.toSorted((a, b) => rank(a.name) - rank(b.name)).map((node) => `var(${node.name})`)
  }
  if (!color(read.name)) return siblingRoles(tokens, read.name, theme) ?? [to]
  const hue = (name: TokenName) => chainOf(tokens, name, theme).at(-1)?.replace(/-\d+$/, "")
  const readHue = hue(read.name)
  const seen = new Set<string>()
  // Roles stay in the hue they start in, and two roles of one colour make one step: the read role
  // first, then the first in file order. Tailwind's utility aliases are not roles of their own.
  return [read, ...graph.values()]
    .filter(
      (node) =>
        node.tier === read.tier &&
        node.declarations[0]?.file === file &&
        !isUtilityAlias(node) &&
        hue(node.name) === readHue,
    )
    .flatMap((node) => {
      const value = resolve(tokens, `var(${node.name})`, theme)
      const rgb = parseColor(value)
      if (seen.has(value) || !rgb) return []
      seen.add(value)
      return [{ name: node.name, lightness: lightness(rgb) }]
    })
    .toSorted((a, b) => a.lightness - b.lightness)
    .map((entry) => `var(${entry.name})`)
}
