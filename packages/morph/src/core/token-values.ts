import valueParser from "postcss-value-parser"

import { declarationIn, type Theme, type TokenGraph, type TokenName } from "./design-system"
import { expressionError, variableOf } from "./css-value"

/** A catalog value, a browser-owned expression, or an invalid replacement. */
export type TokenValue =
  | { readonly kind: "value" | "unresolved"; readonly value: string }
  | { readonly kind: "invalid"; readonly detail: string }

/** Evaluated declarations and active replacement cycles for one theme. */
export interface ThemeValues {
  readonly values: ReadonlyMap<TokenName, TokenValue>
  readonly cycles: ReadonlyMap<TokenName, readonly TokenName[]>
}

type Substitution = Generator<TokenName, TokenValue, TokenValue | undefined>

/** Yields only dependencies actually read; unused fallbacks cannot introduce a cycle. */
function* substitute(nodes: readonly valueParser.Node[]): Substitution {
  let unresolved = false
  let text = ""
  let previousVariable = false
  for (const node of nodes) {
    const variable = variableOf(node)
    let part: TokenValue
    if (variable !== null) {
      const found = yield variable.name
      if (found?.kind === "unresolved")
        part = { kind: "unresolved", value: valueParser.stringify(node) }
      else if (found !== undefined && found.kind !== "invalid") part = found
      else if (variable.fallback !== null) part = yield* substitute(variable.fallback)
      else part = found ?? { kind: "unresolved", value: valueParser.stringify(node) }
    } else if (node.type === "function" && node.value.toLowerCase() !== "url") {
      const inner = yield* substitute(node.nodes)
      part =
        inner.kind === "invalid"
          ? inner
          : {
              ...inner,
              value: `${node.value}(${node.before}${inner.value}${node.after})`,
            }
    } else part = { kind: "value", value: valueParser.stringify(node) }
    if (part.kind === "invalid") return part
    unresolved ||= part.kind === "unresolved"
    // Substitution replaces CSS tokens, not characters: var(--number)px cannot become a length.
    if (
      (previousVariable || variable !== null) &&
      text &&
      part.value &&
      !/\s$/.test(text) &&
      !/^\s/.test(part.value) &&
      node.type !== "div" &&
      node.type !== "comment"
    )
      text += "/**/"
    text += part.value
    previousVariable = variable !== null
    if (text.length > 1_000_000)
      return { kind: "invalid", detail: "Expanded token value exceeds one million characters" }
  }
  return { kind: unresolved ? "unresolved" : "value", value: text }
}

function* expression(value: string): Substitution {
  const keyword = value.trim().toLowerCase()
  if (keyword === "initial") return { kind: "invalid", detail: "Token has the initial value" }
  if (["inherit", "unset", "revert", "revert-layer"].includes(keyword))
    return { kind: "unresolved", value }
  // Unsupported source syntax belongs to the browser; edit policy remains stricter.
  if (expressionError(value) !== undefined) return { kind: "unresolved", value }
  return yield* substitute(valueParser(value).nodes)
}

/** Substitutes a standalone expression using already evaluated token values. */
export function substituteValue(
  value: string,
  lookup: (name: TokenName) => TokenValue | undefined,
): TokenValue {
  const computation = expression(value)
  let step = computation.next()
  while (!step.done) step = computation.next(lookup(step.value))
  return step.value
}

/** Explicit dependency frames avoid recursive token calls and mark only active replacement cycles. */
export function evaluateTheme(graph: TokenGraph, theme: Theme): ThemeValues {
  const expressions = new Map<TokenName, string>()
  for (const node of graph.values()) {
    const declaration = declarationIn(node, theme)
    if (declaration !== undefined) expressions.set(node.name, declaration.value)
  }
  const values = new Map<TokenName, TokenValue>()
  const cycles = new Map<TokenName, readonly TokenName[]>()
  const active = new Map<TokenName, number>()
  const frames: {
    name: TokenName
    computation: Substitution
    step: IteratorResult<TokenName, TokenValue>
  }[] = []
  const enter = (name: TokenName, value: string) => {
    const computation = expression(value)
    active.set(name, frames.length)
    frames.push({ name, computation, step: computation.next() })
  }
  for (const [name, value] of expressions) {
    if (values.has(name)) continue
    enter(name, value)
    while (frames.length > 0) {
      const frame = frames.at(-1)
      if (frame === undefined) break
      const invalid = values.get(frame.name)
      if (invalid !== undefined) frame.step = { done: true, value: invalid }
      if (frame.step.done) {
        const result = values.get(frame.name) ?? frame.step.value
        values.set(frame.name, result)
        active.delete(frame.name)
        frames.pop()
        const parent = frames.at(-1)
        if (parent !== undefined) parent.step = parent.computation.next(result)
        continue
      }
      const dependency = frame.step.value
      const found = values.get(dependency)
      if (found !== undefined) {
        frame.step = frame.computation.next(found)
        continue
      }
      const cycleStart = active.get(dependency)
      if (cycleStart !== undefined) {
        const members = frames.slice(cycleStart).map((entry) => entry.name)
        const invalid: TokenValue = {
          kind: "invalid",
          detail: `${theme.name}: token cycle involving ${members.join(", ")}`,
        }
        for (const member of members) {
          cycles.set(member, members)
          values.set(member, invalid)
        }
        frame.step = frame.computation.next(invalid)
        continue
      }
      const source = expressions.get(dependency)
      if (source === undefined) frame.step = frame.computation.next(undefined)
      else enter(dependency, source)
    }
  }
  return { values, cycles }
}
