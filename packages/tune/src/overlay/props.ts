import { type Attribute } from "../dial/jsx"
import { type PropControl, type PropValue, resolveAt } from "../dial/props"
import { type Instance, instanceName, isComponentName, ownerOf, propsOf } from "../inspector/fiber"
import { instancesOf, isTune } from "../inspector/target"
import { type SourceLoc } from "../variant/model"
import { bridge, explain } from "./bridge"
import { catalogNow, loadTokens, plumbingAt } from "./catalog"
import { sitesOf, sameSite } from "./source"

/** Wrappers a prop is followed through, from the instance up. */
const CHAIN_MAX = 6

/** A component whose body holds the call site, so every one of its uses takes the write. */
export interface Wrapper {
  name: string
  /** Its JSX uses across the product, outside tests and lab examples. */
  uses: number
  /** Its JSX uses in lab examples. */
  examples: number
}

/** Where the panel writes a prop: the call site whose literal, or absence, sets it. */
export interface PropSite {
  site: SourceLoc
  /** The tag written there: the component itself, or a wrapper that passes the prop on. */
  tag: string
  /** The literal the site writes, `null` when it leaves the prop out. */
  written: PropValue | null
  /** How many instances on the page this site renders. */
  places: number
  /** `null` when the site is in a page, or a component rendered in one place only. */
  wrapper: Wrapper | null
}

export interface PropRow {
  control: PropControl
  /** What the instance renders with now. */
  value: PropValue
  /** `null` when code sets the prop, so the row is read-only. */
  at: PropSite | null
}

export interface InstanceProps {
  component: string
  rows: PropRow[]
}

/** The instance, then each component whose render wrote the one below it. */
function ownersOf(instance: Instance): Instance[] {
  const chain = [instance]
  for (let owner = ownerOf(instance); owner && chain.length < CHAIN_MAX; owner = ownerOf(owner))
    chain.push(owner)
  return chain
}

const valueOf = (control: PropControl, instance: Instance): PropValue => {
  const value = propsOf(instance)[control.name]
  return typeof value === typeof control.default ? (value as PropValue) : control.default
}

type Level = { site: SourceLoc; tag: string; attributes: readonly Attribute[] } | null

/**
 * Follows prop `name` up the owner chain: a site that passes the enclosing component's prop on
 * (`variant={variant}`, or a spread that does not name it) hands it to the next site up, as long
 * as that component holds the same value. It stops at a site that writes a literal or leaves the
 * prop out, or at code that computes it.
 */
async function siteFor(
  name: string,
  chain: readonly Instance[],
  levelAt: (depth: number) => Promise<Level>,
): Promise<{ depth: number; written: PropValue | null } | null> {
  for (let depth = 0; depth < chain.length; depth++) {
    const level = await levelAt(depth)
    if (level === null) return null
    const resolved = resolveAt(level.attributes, name)
    if (resolved.kind === "code") return null
    if (resolved.kind === "edit")
      return (await plumbingAt(level.site.path)) ? null : { depth, written: resolved.written }
    const [instance, owner] = [chain[depth], chain[depth + 1]]
    if (instance === undefined || owner === undefined) return null
    if (propsOf(owner)[name] !== propsOf(instance)[name]) return null
  }
  return null
}

/** Each instance of `component` on the page, as its owner chain. */
function instancesIn(root: ParentNode, element: Element, component: string): Instance[][] {
  const catalog = catalogNow()
  return [...root.querySelectorAll(element.tagName)].flatMap((other) => {
    if (isTune(other)) return []
    const found = instancesOf(other, catalog).find(({ name }) => name === component)
    return found === undefined ? [] : [ownersOf(found.instance)]
  })
}

/** How many instances on the page take the prop from `site`, `depth` owners up from each. */
async function placesAt(chains: readonly Instance[][], depth: number, site: SourceLoc) {
  const writers = [...new Set(chains.flatMap((chain) => chain[depth] ?? []))]
  const sites = await sitesOf(writers)
  return sites.filter((other) => sameSite(other, site)).length
}

/**
 * The component whose render wrote the site at `depth`, when code renders it in more than one
 * place. A route's page has no JSX use and a container its page renders once has one, so a site in
 * either reaches only its page.
 */
async function wrapperAt(
  chain: readonly Instance[],
  depth: number,
  site: SourceLoc,
): Promise<Wrapper | null | string> {
  const owner = chain[depth + 1]
  const name = owner && instanceName(owner)
  if (!isComponentName(name)) return null
  const counted = await bridge.uses(name, site.path)
  if (!counted.ok) return explain(counted.error)
  const { uses, examples } = counted.value
  return uses + examples <= 1 ? null : { name, uses, examples }
}

/** The outermost instance the element is the root of that takes props, with its controls. */
async function instanceWithProps(
  element: Element,
): Promise<
  { picked: { name: string; instance: Instance }; controls: PropControl[] } | string | null
> {
  const tokens = await loadTokens()
  if (!tokens.ok) return explain(tokens.error)
  for (const picked of instancesOf(element, catalogNow())) {
    const answer = await bridge.props(picked.name)
    if (!answer.ok) return explain(answer.error)
    const { controls } = answer.value
    if (controls.length > 0) return { picked, controls }
  }
  return null
}

/**
 * The props a designer can set on the picked component instance: an explanation when the bridge
 * fails, `null` when the pick is no instance that takes props.
 */
export async function deriveProps(element: Element): Promise<InstanceProps | string | null> {
  const found = await instanceWithProps(element)
  if (found === null || typeof found === "string") return found
  const { picked, controls } = found
  const chain = ownersOf(picked.instance)
  const sites = await sitesOf(chain)
  const levels = new Map<number, Promise<Level>>()
  const levelAt = (depth: number): Promise<Level> => {
    const cached = levels.get(depth)
    if (cached !== undefined) return cached
    const site = sites[depth] ?? null
    const level: Promise<Level> =
      site === null
        ? Promise.resolve(null)
        : bridge.attributes(site).then((read) => {
            const tag = read.ok ? read.value.tag : null
            return tag && { site, tag: tag.name, attributes: tag.attributes }
          })
    levels.set(depth, level)
    return level
  }
  // The lab repeats a specimen across its page, so only instances in the pointed-at stage count.
  const root: ParentNode = element.closest("[data-tune-stage]") ?? document
  const chains = instancesIn(root, element, picked.name)
  const reach = new Map<number, Promise<{ places: number; wrapper: Wrapper | null } | string>>()
  const rows = await Promise.all(
    controls.map(async (control): Promise<PropRow | string> => {
      const value = valueOf(control, picked.instance)
      const found = await siteFor(control.name, chain, levelAt)
      const level = found && (await levelAt(found.depth))
      if (found === null || level === null) return { control, value, at: null }
      let counted = reach.get(found.depth)
      if (counted === undefined) {
        counted = Promise.all([
          placesAt(chains, found.depth, level.site),
          wrapperAt(chain, found.depth, level.site),
        ]).then(([places, wrapper]) =>
          typeof wrapper === "string" ? wrapper : { places, wrapper },
        )
        reach.set(found.depth, counted)
      }
      const reached = await counted
      if (typeof reached === "string") return reached
      return {
        control,
        value,
        at: { site: level.site, tag: level.tag, written: found.written, ...reached },
      }
    }),
  )
  const failed = rows.find((row) => typeof row === "string")
  if (failed !== undefined) return failed
  return { component: picked.name, rows: rows.filter((row) => typeof row !== "string") }
}
