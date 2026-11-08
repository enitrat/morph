import {
  chainOf,
  type Component,
  currentValue,
  type Display,
  displayOf,
  editError,
  impactOf,
  isUtilityAlias,
  type Scope,
  normalizeValue,
  stepsFor,
  type ThemeName,
  type TokenName,
  type Tokens,
} from "../core"
import { type Read } from "../inspector/types"
import { type SourceLoc } from "../variant/model"
import {
  classOf,
  declarationsOf,
  type Group,
  GROUPS,
  type Scales,
  stepsOf,
  utilityOf,
} from "./utilities"

export interface Step {
  /** The class to write, or the token expression. */
  value: string
  display: Display
  /** For a class: the longhands it sets, which the preview writes inline. */
  css: Readonly<Record<string, string>> | null
}

/**
 * `owner`: the component a component token belongs to, `null` for a shared role, whose edit
 * restyles everything that reads it; `impact`: how many components an edit reaches.
 */
export type Source =
  | { kind: "token"; token: TokenName; scope: Scope; impact: number; owner: string | null }
  | { kind: "utility"; site: SourceLoc }

/** One thing a dial moves: a token in one scope, or one class. `at` is the step the code holds. */
export interface Track {
  source: Source
  steps: readonly Step[]
  at: number
}

/** A row of the Fine-tune panel. A colour token row has a track per scope it can be edited in. */
export interface Row {
  key: string
  group: Group
  label: string
  tracks: Readonly<Partial<Record<Scope, Track>>>
  /** The scopes it has, narrowest reach first; the row opens on the first. */
  order: readonly Scope[]
}

/** Whether a write reaches past the picked component: a shared role restyles all its readers. */
export const isShared = (track: Track) =>
  track.source.kind === "token" && track.source.owner === null

/**
 * The question asked before a track writes, product-wide reach first: always for a shared role;
 * for a component's token whenever it reaches past that component or `places`, the elements it
 * restyles on the page, are more than one; for a class when `places` are. `null` writes at once.
 */
export function questionOf(track: Track, places: number): string | null {
  const { source } = track
  if (source.kind === "token" && source.owner === null)
    return `This changes ${components(source.impact)}. Write it?`
  if (source.kind === "token" && (source.impact > 1 || places > 1))
    return `This changes every ${source.owner} in the product (${components(source.impact)}, ${places} on this page). Write it?`
  return places > 1 ? `This changes ${places} places. Write it?` : null
}

const NOUNS: Record<Group, string> = {
  Size: "size",
  Padding: "padding",
  Gap: "gap",
  Radius: "corner",
  Fill: "surface",
  Text: "text",
  Border: "border",
}

/** What a track changes, in a designer's words; the token or class goes in `detail`. */
export interface Reach {
  /** The segment that picks it: `Button`, `Shared dark`. */
  segment: string
  /** `Every secondary surface in dark mode · 57 components`. */
  line: string
  detail: string
  /** Why a per-theme change on a component goes to a shared role. */
  note: string | null
}

const components = (count: number) => (count === 1 ? "1 component" : `${count} components`)

export function reachOf(row: Row, scope: Scope): Reach | undefined {
  const track = row.tracks[scope]
  if (track === undefined) return undefined
  const { source } = track
  if (source.kind === "utility") {
    const file = `${source.site.path.split("/").at(-1)}:${source.site.line}`
    return {
      segment: "Here",
      line: "This element only",
      detail: `${track.steps[track.at]?.value} · ${file}`,
      note: null,
    }
  }
  const detail = `${source.token}${scope === "all" ? "" : ` (${scope})`}`
  if (source.owner !== null)
    return {
      segment: source.owner,
      line: `Every ${source.owner} · ${components(source.impact)}`,
      detail,
      note: null,
    }
  const role = source.token.replace(/^--/, "").replaceAll("-", " ")
  const theme = scope === "all" ? "Shared" : `Shared ${scope}`
  const own = Object.values(row.tracks).find(
    (other) => other?.source.kind === "token" && other.source.owner !== null,
  )
  const owner = own?.source.kind === "token" ? own.source.owner : null
  return {
    segment: theme,
    line: `Every ${role} ${NOUNS[row.group]}${scope === "all" ? "" : ` in ${scope} mode`} · ${components(source.impact)}`,
    detail,
    note:
      owner === null || scope === "all"
        ? null
        : `${owner} has one ${row.label.toLowerCase()} for every theme, so ${scope} only changes the shared colour.`,
  }
}

export interface Context {
  tokens: Tokens
  scales: Scales
  components: readonly Pick<Component, "slug" | "title" | "reads" | "childReads">[]
  /** The page's theme: what an `all` row reads and displays. */
  theme: ThemeName
}

/** What the element was seen to use: classes its own JSX tag writes, and tokens it reads. */
export interface Seen {
  site: SourceLoc | null
  /** Classes on the element, written once in its tag, whose value the computed style shows. */
  classes: readonly string[]
  reads: readonly Read[]
}

const PROPERTY_GROUPS: readonly [RegExp, Group, string][] = [
  [/^padding$/, "Padding", "Padding"],
  [/^padding-(?:inline|left|right)(?:-start|-end)?$/, "Padding", "Padding x"],
  [/^padding-(?:block|top|bottom)(?:-start|-end)?$/, "Padding", "Padding y"],
  [/^(?:gap|row-gap|column-gap)$/, "Gap", "Gap"],
  [/^(?:min-|max-)?width$/, "Size", "Width"],
  [/^(?:min-|max-)?height$/, "Size", "Height"],
  [/^border(?:-[a-z]+)*-radius$/, "Radius", "Radius"],
  [/^background(?:-color)?$/, "Fill", "Fill"],
  [/^color$/, "Text", "Colour"],
  [/^font-size$/, "Text", "Size"],
  [/^border(?:-[a-z]+)*-color$/, "Border", "Colour"],
  [/^border(?:-[a-z]+)*-width$/, "Border", "Width"],
]

const groupOf = (property: string): [Group, string] | undefined => {
  const entry = PROPERTY_GROUPS.find(([pattern]) => pattern.test(property))
  return entry && [entry[1], entry[2]]
}

const isColor = (group: Group, label: string) => group === "Fill" || label === "Colour"

/** `Button` for `--button-secondary-bg`; `null` for a token no single component owns. */
function ownerOf(context: Context, token: TokenName): string | null {
  if (context.tokens.graph.get(token)?.tier !== "component") return null
  const [owner] = context.components
    .filter((component) => token.startsWith(`--${component.slug}-`))
    .toSorted((a, b) => b.slug.length - a.slug.length)
  return owner?.title ?? "This component"
}

function tokenTrack(context: Context, token: TokenName, scope: Scope): Track | undefined {
  const { tokens } = context
  const theme = scope === "all" ? context.theme : scope
  const current = normalizeValue(currentValue(tokens, token, theme))
  const steps = stepsFor(tokens, current, theme).filter(
    (to) => to === current || editError(tokens, { token, scope, to }) === undefined,
  )
  const at = steps.indexOf(current)
  if (at === -1 || steps.length < 2) return undefined
  const impact = impactOf(tokens.graph, token, context.components)
  return {
    source: { kind: "token", token, scope, impact, owner: ownerOf(context, token) },
    steps: steps.map((value) => ({ value, display: displayOf(tokens, value, theme), css: null })),
    at,
  }
}

/**
 * A colour's tracks: the first token of its chain that is not a Tailwind alias, edited for all
 * themes, and the role under it edited per theme, since a component token never splits by theme.
 */
function colorTracks(context: Context, read: TokenName): Partial<Record<Scope, Track>> {
  const { graph } = context.tokens
  const chain = chainOf(context.tokens, read, context.theme).filter((name) => {
    const node = graph.get(name)
    return node === undefined || !isUtilityAlias(node)
  })
  const [head] = chain
  if (head === undefined) return {}
  const role = graph.get(head)?.tier === "component" ? chain[1] : head
  const split =
    role !== undefined && graph.get(role)?.declarations.some((entry) => entry.block !== "shared")
  const tracks: Partial<Record<Scope, Track>> = {}
  const add = (scope: Scope, track: Track | undefined) => {
    if (track !== undefined) tracks[scope] = track
  }
  if (head !== role || !split) add("all", tokenTrack(context, head, "all"))
  if (role !== undefined && split)
    for (const { name } of context.tokens.themes.list) add(name, tokenTrack(context, role, name))
  return tracks
}

function utilityRow(context: Context, site: SourceLoc, className: string): Row | undefined {
  const utility = utilityOf(className, context.scales)
  if (utility === undefined) return undefined
  const { family } = utility
  const steps = stepsOf(utility, context.scales, context.theme).flatMap((value) => {
    const step = utilityOf(value, context.scales)
    if (step === undefined) return []
    const css = declarationsOf(step, context.scales)
    const display: Display =
      family.scale === "radius"
        ? { kind: "name", text: step.value }
        : displayOf(context.tokens, css[family.properties[0]] ?? "", context.theme)
    return [{ value: classOf(step), display, css }]
  })
  const at = steps.findIndex((step) => step.value === className)
  if (at === -1 || steps.length < 2) return undefined
  return {
    key: `class:${family.prefix}:${family.scale}`,
    group: family.group,
    label: family.label,
    tracks: { all: { source: { kind: "utility", site }, steps, at } },
    order: ["all"],
  }
}

/**
 * The scopes of `tracks`, narrowest first: the component's own before a shared role, fewer
 * components reached before more, the page's theme before the other.
 */
function narrowestFirst(tracks: Partial<Record<Scope, Track>>, theme: ThemeName): Scope[] {
  const rank = (scope: Scope, track: Track) => [
    isShared(track) ? 1 : 0,
    track.source.kind === "token" ? track.source.impact : 0,
    scope === "all" || scope === theme ? 0 : 1,
  ]
  return (Object.entries(tracks) as [Scope, Track | undefined][])
    .flatMap(([scope, track]) => (track === undefined ? [] : [{ scope, key: rank(scope, track) }]))
    .toSorted((a, b) => {
      const at = a.key.findIndex((value, index) => value !== b.key[index])
      return at === -1 ? 0 : (a.key[at] ?? 0) - (b.key[at] ?? 0)
    })
    .map((entry) => entry.scope)
}

/** Fine-tune rows for what the element was seen to use, a class row before a token row. */
export function rowsOf(seen: Seen, context: Context): Row[] {
  const rows: Row[] = []
  const covered = new Set<string>()
  for (const className of seen.site === null ? [] : seen.classes) {
    const row = seen.site && utilityRow(context, seen.site, className)
    if (!row || covered.has(row.key)) continue
    covered.add(row.key)
    covered.add(`${row.group}:${row.label}`)
    rows.push(row)
  }
  for (const read of seen.reads) {
    if (read.state !== "rest") continue
    const grouped = groupOf(read.property)
    if (grouped === undefined) continue
    const [group, label] = grouped
    if (read.via === "inherited" && group !== "Text") continue
    const key = `token:${read.token}`
    if (covered.has(key) || covered.has(`${group}:${label}`)) continue
    covered.add(key)
    const tracks = isColor(group, label)
      ? colorTracks(context, read.token)
      : { all: tokenTrack(context, read.token, "all") }
    const order = narrowestFirst(tracks, context.theme)
    if (order.length === 0) continue
    covered.add(`${group}:${label}`)
    rows.push({ key, group, label, tracks, order })
  }
  return rows.toSorted((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))
}
