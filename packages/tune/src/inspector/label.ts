import { type Naming } from "../core"

/** A catalog entry as the overlay reads it: its title, how it names, and its React names. */
interface CatalogEntry {
  title: string
  naming: Naming
  exports: readonly string[]
}

/** Every exported React name of the catalog, to the entry that exports it. */
export type Catalog = ReadonlyMap<string, CatalogEntry>

export function catalogOf(entries: readonly CatalogEntry[]): Catalog {
  return new Map(entries.flatMap((entry) => entry.exports.map((name) => [name, entry] as const)))
}

/** What an element itself shows: a headline, another heading, a paragraph, a drawn box. */
export type Look = "headline" | "heading" | "text" | "box"

const LOOKS: Record<Look, string> = {
  headline: "Headline",
  heading: "Heading",
  text: "Text",
  box: "Card",
}

/**
 * What an element shows a designer: the components it is the root of, every component that
 * renders it, both innermost first, what it looks like, and its first visible text.
 */
export interface Seen {
  own: readonly string[]
  owners: readonly string[]
  tag: string
  look: Look | null
  text: string | null
}

const TEXT_MAX = 28
const CARD_WORDS = 3

/** `SalesStat` reads as `Sales stat`. */
const humanize = (name: string) =>
  name.replaceAll(/(?<=[a-z\d])([A-Z])/g, (_, letter: string) => ` ${letter.toLowerCase()}`)

/** Layout shells and framework plumbing, which wrap everything and so name nothing. */
const SHELL =
  /(?:Shell|Layout|Container|Frame|Wrapper|Provider|Boundary|Router|Template|Context|Handler|Node)$/

/**
 * The name a designer knows: the root of an `own` component by its name (`Figure`); inside a
 * `container`, its title, or the part of it that renders the element (`Sales stat`); outside one,
 * the nearest catalog component; else what the element shows (`Headline`, `Card`), then the nearest
 * component, never a layout shell such as `AppShell`.
 */
function titleOf(seen: Seen, catalog: Catalog): string {
  const named = (name: string) => {
    const entry = catalog.get(name)
    return entry === undefined || name === entry.title ? name : humanize(name)
  }
  const { own } = seen
  const owners = seen.owners.filter((name) => !SHELL.test(name))
  const root = own.find((name) => catalog.get(name)?.naming === "own")
  const container = owners.find((name) => catalog.get(name)?.naming === "container")
  const listed = root ?? container ?? owners.find((name) => catalog.has(name))
  if (listed !== undefined) return named(listed)
  if (seen.look !== null) return LOOKS[seen.look]
  const [nearest] = owners
  return nearest === undefined ? seen.tag : humanize(nearest)
}

const flat = (text: string) => text.replaceAll(/\s+/g, " ").trim()

/** `‘Top region’`, cut to a glance. */
export function quoted(text: string): string {
  const line = flat(text)
  return `‘${line.length > TEXT_MAX ? `${line.slice(0, TEXT_MAX - 1).trimEnd()}…` : line}’`
}

/** A row of look-alike blocks inside an element: what its first shows, and how many there are. */
export interface Row {
  first: Seen
  count: number
}

const plural = (title: string) => (/s$/i.test(title) ? title : `${title}s`)

/**
 * `Sales stats (2)`: a row named by the component its blocks are, when they are one the element
 * itself is not; `null` when the blocks have no name of their own.
 */
function rowName(seen: Seen, row: Row, catalog: Catalog): string | null {
  const title = titleOf(row.first, catalog)
  if (row.first.own.length === 0 || title === titleOf(seen, catalog)) return null
  return `${plural(title)} (${row.count})`
}

/** ` and 1 more` after the first block of a row. */
const more = (row: Row | null) => (row === null ? "" : ` and ${row.count - 1} more`)

/**
 * `SalesOverview · ‘Your orders’`: the name a designer knows, and the text that tells it apart;
 * a row of look-alike blocks reads `Sales stats (2)`.
 */
export function labelOf(seen: Seen, catalog: Catalog, row: Row | null = null): string {
  const named = row && rowName(seen, row, catalog)
  if (named) return named
  const title = titleOf(seen, catalog)
  if (seen.text === null || seen.text === title) return title
  if (title === LOOKS.box && flat(seen.text).split(" ").length <= CARD_WORDS)
    return `${flat(seen.text)} card${more(row)}`
  return `${title} · ${quoted(seen.text)}${more(row)}`
}

/**
 * How a mark names an element: its text when it has some, else its name; a row of look-alike
 * blocks reads `Sales stats (2)`, or `‘Top region’ and 1 more`, not as its first block alone.
 */
export function shortOf(seen: Seen, catalog: Catalog, row: Row | null = null): string {
  const named = row && rowName(seen, row, catalog)
  if (named) return named
  return `${seen.text === null ? titleOf(seen, catalog) : quoted(seen.text)}${more(row)}`
}

export type Place = "before" | "after" | "inside"

/** Where a box mark lands: beside or inside an element, or drawn around it. */
export type BoxPlace = Place | "around"

export const SPATIAL: Record<Place, string> = { before: "above", after: "below", inside: "into" }

/** `Move ‘Your orders’ below ‘Top region’`. */
export function arrowCaption(from: string, place: Place, to: string): string {
  return `Move ${from} ${SPATIAL[place]} ${to}`
}

/**
 * `New ‘Notice’ above ‘Top region’`, or `Something new inside …` while it has no words; a box
 * drawn over content reads `Around ‘Pricing’`, then `Around ‘Pricing’: ‘softer’`.
 */
export function boxCaption(label: string, place: BoxPlace, at: string): string {
  const words = label.trim()
  if (place === "around") return words === "" ? `Around ${at}` : `Around ${at}: ${quoted(words)}`
  const what = words === "" ? "Something new" : `New ${quoted(words)}`
  return `${what} ${place === "inside" ? "inside" : SPATIAL[place]} ${at}`
}
