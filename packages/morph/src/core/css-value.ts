import valueParser from "postcss-value-parser"

import { type TokenName } from "./design-system"

/** The token names supported by the design-system graph. */
export const isTokenName = (name: string): name is TokenName => /^--[\w-]+$/.test(name)

/** A parsed var() with an absent fallback distinguished from a valid empty fallback. */
export function variableOf(
  node: valueParser.Node,
): { name: TokenName; fallback: valueParser.Node[] | null } | null {
  if (node.type !== "function" || node.value.toLowerCase() !== "var" || node.unclosed) return null
  const content = node.nodes.filter((entry) => entry.type !== "space" && entry.type !== "comment")
  const [name, comma] = content
  if (name?.type !== "word" || !isTokenName(name.value)) return null
  if (comma === undefined) return { name: name.value, fallback: null }
  if (comma.type !== "div" || comma.value !== ",") return null
  return { name: name.value, fallback: node.nodes.slice(node.nodes.indexOf(comma) + 1) }
}

/** Canonical whitespace outside strings; quoted text and function contents retain their meaning. */
export function normalizeValue(value: string): string {
  const parsed = valueParser(value)
  parsed.walk((node) => {
    if (node.type === "space") node.value = " "
    if (node.type === "function") {
      node.before = ""
      node.after = ""
    }
  })
  return parsed.toString().trim()
}

/** Every syntactic var() dependency, including unused fallback branches but excluding quoted text. */
export function referencesOf(value: string): TokenName[] {
  const names: TokenName[] = []
  valueParser(value).walk((node) => {
    const variable = variableOf(node)
    if (variable !== null) names.push(variable.name)
  })
  return names
}

/** The sole variable of an exact alias, excluding values with a fallback. */
export function aliasOf(value: string): TokenName | null {
  const nodes = valueParser(value).nodes.filter(
    (node) => node.type !== "space" && node.type !== "comment",
  )
  const first = nodes[0]
  const variable = first === undefined || nodes.length !== 1 ? null : variableOf(first)
  return variable?.fallback === null ? variable.name : null
}

/** Rejects unterminated syntax and malformed var() calls before editing source. */
export function expressionError(value: string): string | undefined {
  let invalid = false
  valueParser(value).walk((node) => {
    if (node.type === "function" && node.value.toLowerCase() === "url") {
      if (node.unclosed) invalid = true
      return false
    }
    if (
      (node.type === "function" || node.type === "string" || node.type === "comment") &&
      node.unclosed
    )
      invalid = true
    if (node.type === "function" && node.value.toLowerCase() === "var" && variableOf(node) === null)
      invalid = true
    if (node.type === "word" && /[;{}()]/.test(node.value)) invalid = true
  })
  return invalid ? `${value} is not a complete token expression` : undefined
}
