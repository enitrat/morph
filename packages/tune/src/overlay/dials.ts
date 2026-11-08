import {
  activationOf,
  dependentsOf,
  fromWire,
  previewCss,
  referencesOf,
  type Scope,
  type ThemeModel,
  themeNamed,
  type ThemeName,
  type TokenGraph,
  type TokenName,
} from "../core"
import { type Context, questionOf, type Row, rowsOf, type Track } from "../dial/rows"
import { declarationsOf, scalesOf, utilityOf } from "../dial/utilities"
import { probe } from "../inspector/probe"
import { readsOf, RuleIndex } from "../inspector/reads"
import { isTune } from "../inspector/target"
import { type SourceLoc } from "../variant/model"
import { bridge, explain } from "./bridge"
import { invalidateCatalog, loadTokens } from "./catalog"
import { clearPreview, previewClass, previewToken } from "./preview"
import { invalidateSources, locate } from "./source"

type Base = Omit<Context, "theme">

let index: RuleIndex | undefined

/** The token graph and component reads for this derivation. */
async function loadBase(): Promise<Base | string> {
  const answer = await loadTokens()
  if (!answer.ok) return explain(answer.error)
  const { tokens, components } = fromWire(answer.value)
  return { tokens, scales: scalesOf(tokens), components }
}

/** Whether `className` is what the element's computed style shows, not a class it overrides. */
function wins(element: Element, className: string, context: Context): boolean {
  const utility = utilityOf(className, context.scales)
  if (utility === undefined) return false
  const [property] = utility.family.properties
  const value = declarationsOf(utility, context.scales)[property] ?? ""
  return (
    probe(property, value, activationOf(themeNamed(context.tokens.themes, context.theme))) ===
    getComputedStyle(element).getPropertyValue(property)
  )
}

/** A row and a dial for each scope it can be edited in. */
export interface Dialed {
  row: Row
  dials: Partial<Record<Scope, Dial>>
}

const PSEUDO_ELEMENT = /::[\w-]+(?:\([^)]*\))?/g

/**
 * The selector a leaf token's preview is declared on, since a `:root` rule restyles the whole page
 * on each step; `null` keeps it on `:root`, where a token other tokens read is cheaper to restyle.
 */
function readersOf(graph: TokenGraph, rules: RuleIndex, token: TokenName): string | null {
  if (dependentsOf(graph, [token]).size > 0) return null
  const selectors = new Set<string>()
  for (const entry of rules.all) {
    if (graph.has(entry.property as TokenName)) continue
    if (!referencesOf(entry.value).includes(token)) continue
    const selector = entry.base.replaceAll(PSEUDO_ELEMENT, "").trim()
    if (selector === "" || selector === "*") return null
    if (CSS.supports(`selector(${selector})`)) selectors.add(selector)
  }
  return selectors.size === 0 ? null : `:is(${[...selectors].join(", ")})`
}

/** How many page elements read `token`, directly or through a token built on it. */
function tokenPlaces(
  graph: TokenGraph,
  rules: RuleIndex,
  token: TokenName,
  root: ParentNode,
): number {
  const names = new Set([token, ...dependentsOf(graph, [token])])
  const found = new Set<Element>()
  for (const entry of rules.all) {
    if (graph.has(entry.property as TokenName)) continue
    if (!referencesOf(entry.value).some((name) => names.has(name))) continue
    const selector = entry.base.replaceAll(PSEUDO_ELEMENT, "").trim()
    if (selector === "" || selector === "*") continue
    try {
      for (const element of root.querySelectorAll(selector))
        if (!isTune(element)) found.add(element)
    } catch {
      // A selector the browser rejects counts no elements.
    }
  }
  return found.size
}

const sameSite = (a: SourceLoc | null, b: SourceLoc) =>
  a !== null && a.path === b.path && a.line === b.line && a.col === b.col

/** How many page elements one JSX tag renders, as a list renders the same tag once per item. */
async function sitePlaces(element: Element, site: SourceLoc, root: ParentNode): Promise<number> {
  const classes = element.getAttribute("class")
  const alike = [...root.querySelectorAll(element.tagName)].filter(
    (other) => other.getAttribute("class") === classes && !isTune(other),
  )
  const sites = await Promise.all(alike.map(async (other) => (await locate(other)).site))
  return sites.filter((other) => sameSite(other, site)).length
}

/** Confirmed reaches, by row and track, so each is asked once per page session. */
const confirmedReach = new Set<string>()

type Preview =
  | { kind: "class"; element: Element }
  | { kind: "token"; themes: ThemeModel; token: TokenName; scope: Scope; within: string | null }

function showStep(preview: Preview, value: string, css: Readonly<Record<string, string>> | null) {
  if (preview.kind === "class") {
    if (css && preview.element instanceof HTMLElement) previewClass(preview.element, css)
    return
  }
  const { themes, token, scope, within } = preview
  previewToken(
    `${token} ${scope}`,
    previewCss(themes, [{ token, scope, to: value }], within === null ? "page" : { within }),
  )
}

/** The rows for `element`: what its tag writes and what its styles read. */
export async function deriveRows(element: Element, theme: ThemeName): Promise<Dialed[] | string> {
  clearPreview()
  const loaded = await loadBase()
  if (typeof loaded === "string") return loaded
  const context: Context = { ...loaded, theme }
  const { site } = await locate(element)
  const tag = site === null ? null : await bridge.tag(site)
  const written = new Set(tag?.ok ? tag.value.classes : [])
  const classes = [...element.classList].filter(
    (name) => written.has(name) && wins(element, name, context),
  )
  index ??= new RuleIndex()
  const style = getComputedStyle(element)
  const bordered = ["top", "right", "bottom", "left"].some(
    (side) => style.getPropertyValue(`border-${side}-width`) !== "0px",
  )
  // Every element reads the base layer's border colour; it is a dial only where a border shows.
  const { graph } = context.tokens
  const shown = activationOf(themeNamed(context.tokens.themes, theme))
  const reads = readsOf(element, index, graph, shown).filter(
    (read) => bordered || !/^border(?:-[a-z]+)*-color$/.test(read.property),
  )
  const rules = index
  const rows = rowsOf({ site, classes, reads }, context)
  const utility = rows.some((row) => row.tracks.all?.source.kind === "utility")
  // Locating every look-alike costs a bridge call each, so only a class row counts them.
  // The lab repeats a specimen across its page; a designer counts what the stage they point in shows.
  const root: ParentNode = element.closest("[data-tune-stage]") ?? document
  const here = site !== null && utility ? await sitePlaces(element, site, root) : 1
  return rows.map((row) => ({
    row,
    dials: Object.fromEntries(
      Object.entries(row.tracks).flatMap(([scope, track]) => {
        if (track === undefined) return []
        const { source } = track
        const preview: Preview =
          source.kind === "utility"
            ? { kind: "class", element }
            : {
                kind: "token",
                themes: context.tokens.themes,
                token: source.token,
                scope: source.scope,
                within: readersOf(graph, rules, source.token),
              }
        const places =
          source.kind === "utility" ? here : tokenPlaces(graph, rules, source.token, root)
        const reach = `${row.key} ${scope}${source.kind === "utility" ? ` ${source.site.path}:${source.site.line}` : ""}`
        return [[scope, new Dial(track, preview, questionOf(track, places), reach)] as const]
      }),
    ),
  }))
}

/**
 * Moves one track: `step` previews at once, `release` writes the step the dial rests on. Writes
 * run one at a time; a release while one is in flight writes the latest step after it. A track
 * that reaches past the picked element writes nothing until the designer has confirmed its
 * reach, once per row for the page session.
 */
export class Dial {
  readonly track: Track
  /** What the designer is asked before the first write, or `null` when nothing is asked. */
  readonly question: string | null
  at: number
  private readonly preview: Preview
  private readonly reach: string
  private written: number
  private confirmed: boolean
  private writing: Promise<void> | null = null
  private readonly refusals = new Set<(message: string) => void>()

  constructor(track: Track, preview: Preview, question: string | null, reach: string) {
    this.track = track
    this.preview = preview
    this.question = question
    this.reach = reach
    this.at = track.at
    this.written = track.at
    this.confirmed = question === null || confirmedReach.has(reach)
  }

  /** True while the dial shows a step it will write only once its reach is confirmed. */
  get unconfirmed(): boolean {
    return !this.confirmed && this.at !== this.written
  }

  confirm(): void {
    this.confirmed = true
    confirmedReach.add(this.reach)
    this.release()
  }

  /** Back to the step the code holds. */
  revert(): number {
    this.show(this.written)
    return this.at
  }

  /** Tells `listener` when a refused write moves the dial back to the step the code holds. */
  onRefused(listener: (message: string) => void): () => void {
    this.refusals.add(listener)
    return () => {
      this.refusals.delete(listener)
    }
  }

  step(delta: number): number {
    const next = Math.min(this.track.steps.length - 1, Math.max(0, this.at + delta))
    if (next !== this.at) this.show(next)
    return this.at
  }

  private show(at: number) {
    this.at = at
    const step = this.track.steps[at]
    if (step !== undefined) showStep(this.preview, step.value, step.css)
  }

  release(): void {
    if (this.writing || !this.confirmed) return
    this.writing = this.flush().finally(() => {
      this.writing = null
    })
  }

  private async flush(): Promise<void> {
    while (this.at !== this.written) {
      const { at } = this
      const from = this.track.steps[this.written]?.value ?? ""
      const to = this.track.steps[at]?.value ?? ""
      const { source } = this.track
      const answer = await bridge.dial(
        source.kind === "token"
          ? { kind: "token", token: source.token, scope: source.scope, to }
          : { kind: "utility", site: source.site, from, to },
      )
      if (!answer.ok) {
        this.show(this.written)
        for (const listener of this.refusals) listener(explain(answer.error))
        return
      }
      this.written = at
      invalidateCatalog()
      invalidateSources()
    }
  }
}
