import { z } from "zod"

import {
  alternativesOf,
  CssTokens,
  normalizeSelector,
  type PathRule,
  type RootState,
  rootStateOf,
  type ThemeName,
  type ThemesConfig,
  Naming,
  Tier,
  TuneConfig,
} from "./config"
import { buildTokens } from "./graph"

export type TokenName = `--${string}`

/** The block a declaration lives in: one every theme reads, or one theme's own. */
export type BlockId = "shared" | ThemeName

export interface Declaration {
  file: string
  block: BlockId
  value: string
  /**
   * Declared inside `@theme`, where Tailwind compiles a utility from it. `default` is Tailwind's
   * own `@theme default`: any app declaration of the token replaces it.
   */
  theme: "none" | "app" | "default"
}

export interface TokenNode {
  name: TokenName
  tier: Tier
  declarations: readonly Declaration[]
}

export type TokenGraph = ReadonlyMap<TokenName, TokenNode>

export interface Theme {
  name: ThemeName
  /** Where it reads a token, in order: itself, then each fallback. Shared blocks come last. */
  reads: readonly ThemeName[]
  /** Its configured selectors, normalized. */
  selectors: readonly string[]
  /** Each `<html>` state that shows it, one per selector alternative. */
  activations: readonly RootState[]
}

export interface ThemeModel {
  /** Config order; the first is the reference theme. */
  list: readonly [Theme, ...Theme[]]
  shared: readonly string[]
  blockOf(selector: string): BlockId | undefined
  selectorsOf(block: BlockId): readonly string[]
}

/** One token source file, with what the builder decided about it. */
export interface TokenFile {
  path: string
  css: string
  tier: Tier
  /** False for a file the repo does not own, such as one under `node_modules`: never written. */
  owned: boolean
}

export interface Tokens {
  graph: TokenGraph
  themes: ThemeModel
  files: readonly TokenFile[]
}

/** What an edit writes: every theme's value, or one theme's. */
export type Scope = "all" | ThemeName

/** Where a component's settable props come from. */
const PropSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("lab-meta"), meta: z.string() }),
  z.object({ kind: z.literal("cva"), file: z.string() }),
])
/** Where a component's settable props come from. */
export type PropSource = z.infer<typeof PropSource>

const strings: z.ZodType<readonly string[]> = z.array(z.string())
const ComponentWire = z.object({
  /** Its folder or file stem: `button`. */
  slug: z.string(),
  title: z.string(),
  /** Free label from the config: `atom`, `block`, `ui`. */
  group: z.string(),
  /** How a pointed element is named by it. */
  naming: Naming,
  /** Its lab page, or null when the app has no catalogue. */
  href: z.string().nullable(),
  /** Its import specifier, or null when the agent is never offered it. */
  importFrom: z.string().nullable(),
  /** The React names its files export. */
  exports: strings,
  /** Names importable with named import syntax, when known. */
  namedExports: strings,
  files: strings,
  /** Every token its own files read. */
  reads: strings,
  /** Every token the components it renders read, closed over what those render. */
  childReads: strings,
  props: PropSource,
})

/** A component's metadata and the token sets its files read. */
export type Component = Omit<z.infer<typeof ComponentWire>, "reads" | "childReads"> & {
  /** Every token its own files read. */
  reads: ReadonlySet<TokenName>
  /** Every token the components it renders read, closed over what those render. */
  childReads: ReadonlySet<TokenName>
}

export interface DesignSystem {
  tokens: Tokens
  components: readonly Component[]
  /** Paths whose call sites are rarely what a designer means when picking an element. */
  plumbing: readonly PathRule[]
}

export const isPlumbing = (plumbing: readonly PathRule[], path: string): boolean =>
  plumbing.some(
    (rule) => path.startsWith(rule.prefix) && !rule.except.some((part) => path.includes(part)),
  )

const tokenFiles: z.ZodType<readonly TokenFile[]> = z.array(
  z.object({ path: z.string(), css: z.string(), tier: Tier, owned: z.boolean() }),
)
const components: z.ZodType<readonly z.infer<typeof ComponentWire>[]> = z.array(ComponentWire)
const plumbing: z.ZodType<readonly PathRule[]> = TuneConfig.shape.plumbing

/** The model as `GET tokens` sends it: sources rather than a graph, arrays rather than sets. */
export const DesignSystemWire = z.object({
  files: tokenFiles,
  themes: CssTokens.shape.themes,
  components,
  plumbing,
})
/** The model sent by `GET tokens`. */
export type DesignSystemWire = z.infer<typeof DesignSystemWire>

export const toWire = (ds: DesignSystem, themes: ThemesConfig): DesignSystemWire => ({
  files: ds.tokens.files,
  themes,
  components: ds.components.map((component) => ({
    ...component,
    reads: [...component.reads],
    childReads: [...component.childReads],
  })),
  plumbing: ds.plumbing,
})

/** The browser rebuilds the graph from the sources, with the tiers the builder decided. */
export const fromWire = (wire: DesignSystemWire): DesignSystem => ({
  tokens: buildTokens(wire.files, themeModelOf(wire.themes)),
  components: wire.components.map((component) => ({
    ...component,
    // SAFETY: The bridge emits token names, but the wire parser also accepts arbitrary strings.
    reads: new Set(component.reads as TokenName[]),
    // SAFETY: This has the same trust assumption as the component's own reads.
    childReads: new Set(component.childReads as TokenName[]),
  })),
  plumbing: wire.plumbing,
})

export function themeModelOf(config: ThemesConfig): ThemeModel {
  const fallbackOf = new Map(config.list.map((theme) => [theme.name, theme.fallback]))
  const readsOf = (name: ThemeName): ThemeName[] => {
    const fallback = fallbackOf.get(name)
    return [name, ...(fallback === undefined ? [] : readsOf(fallback))]
  }
  const themes = config.list.map((theme): Theme => ({
    name: theme.name,
    reads: readsOf(theme.name),
    selectors: theme.selectors,
    activations: [
      ...new Map(
        theme.selectors.flatMap(alternativesOf).map((part) => {
          const state = rootStateOf(part)
          if (state === undefined) throw new Error(`${part} does not select <html>`)
          return [JSON.stringify(state), state] as const
        }),
      ).values(),
    ],
  }))
  const [first, ...rest] = themes
  if (first === undefined) throw new Error("a design system lists at least one theme")
  const blocks = new Map<string, BlockId>(config.shared.map((selector) => [selector, "shared"]))
  for (const theme of themes)
    for (const selector of theme.selectors) blocks.set(selector, theme.name)
  return {
    list: [first, ...rest],
    shared: config.shared,
    blockOf: (selector) => blocks.get(normalizeSelector(selector)),
    selectorsOf: (block) =>
      block === "shared"
        ? config.shared
        : (themes.find((theme) => theme.name === block)?.selectors ?? []),
  }
}

const sizeOf = (state: RootState) => state.classes.length + Object.keys(state.attributes).length

/** The root state that shows `theme` most surely: its activation that requires the most. */
export function activationOf(theme: Theme): RootState {
  const [first, ...rest] = theme.activations
  if (first === undefined) throw new Error(`${theme.name} has no activation`)
  return rest.reduce((best, state) => (sizeOf(state) > sizeOf(best) ? state : best), first)
}

/**
 * The theme `<html>` shows: the one whose activation it matches with the most requirements, so a
 * root with `data-theme='claude'` and `.dark` shows `claude-dark` over `claude`. A root no theme
 * matches shows the reference theme.
 */
export function themeOfRoot(
  themes: ThemeModel,
  root: { classes: ReadonlySet<string>; attributes: Readonly<Record<string, string>> },
): ThemeName {
  const matches = (state: RootState) =>
    state.classes.every((name) => root.classes.has(name)) &&
    Object.entries(state.attributes).every(([name, value]) => root.attributes[name] === value)
  let best: { name: ThemeName; size: number } = { name: themes.list[0].name, size: -1 }
  for (const theme of themes.list)
    for (const state of theme.activations)
      if (matches(state) && sizeOf(state) > best.size)
        best = { name: theme.name, size: sizeOf(state) }
  return best.name
}

export function themeNamed(themes: ThemeModel, name: string): Theme {
  const theme = themes.list.find((entry) => entry.name === name)
  if (theme === undefined) throw new Error(`${name} is not a theme`)
  return theme
}

/**
 * A node Tailwind's `@theme inline` adds over a role: every declaration is in an app `@theme` and
 * reads one token, as `--color-secondary: var(--secondary)`. Chains and colour steps skip it.
 */
export const isUtilityAlias = (node: TokenNode): boolean =>
  node.declarations.every((entry) => entry.theme === "app" && /^var\(--[\w-]+\)$/.test(entry.value))

/** Whether a node is declared in a `@theme` block, where Tailwind compiles a utility from it. */
export const isThemeToken = (node: TokenNode): boolean =>
  node.declarations.some((entry) => entry.theme !== "none")

/** The declaration `theme` reads: its own, then each fallback's, then the shared one. */
export function declarationFor(tokens: Tokens, node: TokenNode, theme: ThemeName): Declaration {
  for (const block of [...themeNamed(tokens.themes, theme).reads, "shared"]) {
    const found = node.declarations.find((entry) => entry.block === block)
    if (found) return found
  }
  throw new Error(`${node.name} has no ${theme} declaration`)
}
