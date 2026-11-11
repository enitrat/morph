import { type ThemeName } from "./config"
import {
  declarationIn,
  themeNamed,
  type Declaration,
  type ThemeModel,
  type TokenFile,
  type TokenGraph,
  type TokenName,
  type TokenNode,
  type Tokens,
} from "./design-system"

import { parseTokenSource } from "./token-source"
import { aliasOf, isTokenName, referencesOf } from "./css-value"
import { evaluateTheme, substituteValue } from "./token-values"

/**
 * The token graph of ordered sources. A token redeclared in the same block of a later file keeps
 * its first declaration, unless that one is a Tailwind default, which any app declaration replaces.
 * A node's tier is its first declaration's file's.
 */
export function buildTokens(files: readonly TokenFile[], themes: ThemeModel): Tokens {
  const declared = new Map<TokenName, Declaration[]>()
  const resets: string[] = []
  const sources = new Map(files.map((file) => [file.path, parseTokenSource(file, themes)]))
  for (const source of sources.values()) {
    for (const block of source.blocks) resets.push(...block.resets)
    const declarations = source.blocks
      .flatMap((block) => block.declarations.map((origin) => ({ block, origin })))
      .sort((a, b) => a.origin.span.start - b.origin.span.start)
    for (const { block, origin } of declarations) {
      const name = origin.name
      const declaration: Declaration = {
        file: source.file.path,
        block: block.id,
        value: origin.value,
        theme: block.theme,
        origin: { block, declaration: origin },
      }
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
  const values = new Map(themes.list.map((theme) => [theme.name, evaluateTheme(graph, theme)]))
  return { graph, themes, files, sources, values }
}

export function nodeOf(graph: TokenGraph, name: string): TokenNode {
  const node = isTokenName(name) ? graph.get(name) : undefined
  if (!node) throw new Error(`${name} is not a ds token`)
  return node
}

/** `--button-secondary-bg` in dark: the token, then each token it aliases, down to a value. */
export function chainOf(tokens: Tokens, name: TokenName, theme: ThemeName): TokenName[] {
  const chain: TokenName[] = []
  const selected = themeNamed(tokens.themes, theme)
  const values = tokens.values.get(theme)?.values
  let current: TokenName | null = name
  while (current !== null) {
    if (values?.get(current)?.kind === "invalid") return []
    chain.push(current)
    const node = tokens.graph.get(current)
    const declaration = node === undefined ? undefined : declarationIn(node, selected)
    if (declaration === undefined) break
    current = aliasOf(declaration.value)
  }
  return chain
}

/** Resolves known variables; invalid or external values remain browser expressions instead of throwing. */
export function resolve(tokens: Tokens, value: string, theme: ThemeName): string {
  const result = substituteValue(value, (name) => tokens.values.get(theme)?.values.get(name))
  return result.kind === "invalid" ? value : result.value
}

/** Resolves one token using its selected theme declaration and any declared fallbacks. */
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
    const next = queue.pop()
    if (next === undefined) break
    for (const reader of readers.get(next) ?? []) {
      if (seen.has(reader)) continue
      seen.add(reader)
      queue.push(reader)
    }
  }
  return seen
}
