import { type ThemeName } from "./config"
import {
  declarationFor,
  type Declaration,
  type ThemeModel,
  type TokenFile,
  type TokenGraph,
  type TokenName,
  type TokenNode,
  type Tokens,
} from "./design-system"

/**
 * Strips what the block scan must not read: comments, `@media` overrides, and `@keyframes`, whose
 * nested blocks would hide the declarations of a `@theme` that holds them.
 */
function clean(css: string): string {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/@media[^{]*\{[^{}]*\{[^{}]*\}\s*\}/g, "")
    .replaceAll(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
}

export function normalizeValue(value: string): string {
  return value.replaceAll(/\s+/g, " ").replaceAll("( ", "(").replaceAll(" )", ")").trim()
}

interface Parsed {
  declarations: { name: TokenName; declaration: Declaration }[]
  /** `--radius-` for an app `@theme` `--radius-*: initial`, which drops Tailwind's defaults. */
  resets: string[]
}

function parse(file: TokenFile, themes: ThemeModel): Parsed {
  const parsed: Parsed = { declarations: [], resets: [] }
  for (const match of clean(file.css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim()
    const body = match[2] ?? ""
    const words = selector.split(/\s+/)
    if (words[0] === "@theme" && words.includes("reference")) continue
    const theme = words[0] !== "@theme" ? "none" : words.includes("default") ? "default" : "app"
    const block = theme === "none" ? themes.blockOf(selector) : "shared"
    if (!block) continue
    if (theme === "app")
      for (const [, prefix = ""] of body.matchAll(/(--[\w-]*)\*\s*:\s*initial\s*;/g))
        parsed.resets.push(prefix)
    for (const [, name = "", value = ""] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (name.endsWith("-")) continue
      parsed.declarations.push({
        name: name as TokenName,
        declaration: { file: file.path, block, value: normalizeValue(value), theme },
      })
    }
  }
  return parsed
}

/**
 * The token graph of ordered sources. A token redeclared in the same block of a later file keeps
 * its first declaration, unless that one is a Tailwind default, which any app declaration replaces.
 * A node's tier is its first declaration's file's.
 */
export function buildTokens(files: readonly TokenFile[], themes: ThemeModel): Tokens {
  const declared = new Map<TokenName, Declaration[]>()
  const resets: string[] = []
  for (const file of files) {
    const parsed = parse(file, themes)
    resets.push(...parsed.resets)
    for (const { name, declaration } of parsed.declarations) {
      const list = declared.get(name) ?? []
      const at = list.findIndex((existing) => existing.block === declaration.block)
      const existing = list[at]
      if (existing === undefined) list.push(declaration)
      else if (existing.theme === "default" && declaration.theme !== "default")
        list[at] = declaration
      declared.set(name, list)
    }
  }
  const tierOf = new Map(files.map((file) => [file.path, file.tier]))
  const graph = new Map<TokenName, TokenNode>()
  for (const [name, list] of declared) {
    const reset = resets.some((prefix) => name.startsWith(prefix))
    const declarations = reset ? list.filter((entry) => entry.theme !== "default") : list
    const tier = tierOf.get(declarations[0]?.file ?? "")
    if (tier === undefined) continue
    graph.set(name, { name, tier, declarations })
  }
  return { graph, themes, files }
}

export function referencesOf(value: string): TokenName[] {
  return [...value.matchAll(/var\((--[\w-]+)/g)].map(([, name]) => name as TokenName)
}

export function nodeOf(graph: TokenGraph, name: string): TokenNode {
  const node = graph.get(name as TokenName)
  if (!node) throw new Error(`${name} is not a ds token`)
  return node
}

/** `--button-secondary-bg` in dark: the token, then each token it aliases, down to a value. */
export function chainOf(tokens: Tokens, name: TokenName, theme: ThemeName): TokenName[] {
  const chain: TokenName[] = [name]
  let current = tokens.graph.get(name)
  while (current) {
    const { value } = declarationFor(tokens, current, theme)
    const match = /^var\((--[\w-]+)\)$/.exec(value)
    if (!match) break
    const next = match[1] as TokenName
    if (chain.includes(next)) break
    chain.push(next)
    current = tokens.graph.get(next)
  }
  return chain
}

/**
 * The value with every `var()` substituted, as far as the graph knows: `#282828`, or a
 * `color-mix()` of literals. The browser computes the rest.
 */
export function resolve(tokens: Tokens, value: string, theme: ThemeName, depth = 0): string {
  if (depth > 24) throw new Error(`token cycle while resolving ${value}`)
  return value.replaceAll(
    /var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g,
    (whole, name: string, fallback?: string) => {
      const node = tokens.graph.get(name as TokenName)
      if (!node) return fallback ?? whole
      return resolve(tokens, declarationFor(tokens, node, theme).value, theme, depth + 1)
    },
  )
}

export function resolveToken(tokens: Tokens, name: TokenName, theme: ThemeName): string {
  return resolve(tokens, `var(${name})`, theme)
}

/** Every token whose value reads `name`, directly or through another token. */
export function dependentsOf(graph: TokenGraph, names: Iterable<TokenName>): Set<TokenName> {
  const readers = new Map<TokenName, Set<TokenName>>()
  for (const node of graph.values()) {
    for (const declaration of node.declarations) {
      for (const read of referencesOf(declaration.value)) {
        const set = readers.get(read) ?? new Set()
        set.add(node.name)
        readers.set(read, set)
      }
    }
  }
  const seen = new Set<TokenName>()
  const queue = [...names]
  while (queue.length > 0) {
    const next = queue.pop() as TokenName
    for (const reader of readers.get(next) ?? []) {
      if (seen.has(reader)) continue
      seen.add(reader)
      queue.push(reader)
    }
  }
  return seen
}
