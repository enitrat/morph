import { referencesOf } from "../core/graph"
import { type TokenGraph, type TokenName } from "../core/design-system"
import { alternativesOf, type RootState } from "../core/config"
import { probe } from "./probe"
import { type Read, type ReadState } from "./types"

interface Declared {
  /** The selector with its state parts removed; `*` when only a state remained. */
  base: string
  state: ReadState
  property: string
  value: string
}

const STATES: readonly [RegExp, ReadState][] = [
  [/:hover\b/g, "hover"],
  [/:focus-visible\b/g, "focus-visible"],
  [/:focus-within\b|:focus\b/g, "focus-visible"],
  [/:active\b/g, "active"],
  [/:disabled\b|\[(?:data-)?disabled(?:=[^\]]*)?\]|\[aria-disabled=[^\]]*\]/g, "disabled"],
  [
    /:checked\b|\[data-(?:checked|selected)(?:=[^\]]*)?\]|\[aria-(?:checked|selected)=[^\]]*\]/g,
    "checked",
  ],
  [/\[data-(?:open|popup-open|expanded)(?:=[^\]]*)?\]|\[aria-expanded=[^\]]*\]/g, "open"],
  [/\[data-state=["']?(?:open|on|active)["']?\]/g, "open"],
]

/**
 * Each property `style` declares through a `var()`. A shorthand that reads a `var()`, such as
 * `padding-inline: var(--button-px-md)`, enumerates as longhands whose values stay empty until
 * computed, so the shorthand is read under its own name, taken from the declaration text.
 */
export function varDeclarations(
  style: Pick<CSSStyleDeclaration, "length" | "item" | "cssText" | "getPropertyValue">,
): [property: string, value: string][] {
  const names = new Set(Array.from({ length: style.length }, (_, at) => style.item(at)))
  for (const [, name = ""] of style.cssText.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) names.add(name)
  return [...names].flatMap((property) => {
    const value = style.getPropertyValue(property).trim()
    return value.includes("var(--") ? [[property, value] as [string, string]] : []
  })
}

function stripState(selector: string): { base: string; state: ReadState } {
  let state: ReadState = "rest"
  let base = selector.replaceAll(/:not\((?:[^()]|\([^()]*\))*\)/g, "")
  for (const [pattern, name] of STATES) {
    const next = base.replaceAll(pattern, "")
    if (next !== base && state === "rest") state = name
    base = next
  }
  base = base.replaceAll(/:(?:where|is|not)\(\s*\)/g, "").trim()
  if (base === "" || /[>+~]\s*$/.test(base)) base = `${base}*`
  return { base, state }
}

const isGrouping = (rule: CSSRule): rule is CSSGroupingRule => "cssRules" in rule

function admits(rule: CSSRule): boolean {
  if (rule instanceof CSSMediaRule) return matchMedia(rule.conditionText).matches
  if (rule instanceof CSSSupportsRule) return CSS.supports(rule.conditionText)
  return true
}

function collect(rules: CSSRuleList, parents: readonly string[], out: Declared[]): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const selectors = alternativesOf(rule.selectorText)
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((selector) =>
          parents.length === 0
            ? [selector]
            : parents.map((parent) =>
                selector.includes("&") ? selector.replaceAll("&", parent) : `${parent} ${selector}`,
              ),
        )
      for (const [property, value] of varDeclarations(rule.style)) {
        for (const selector of selectors) {
          out.push({ ...stripState(selector), property, value })
        }
      }
      if (rule.cssRules.length > 0) {
        collect(
          rule.cssRules,
          selectors.map((selector) => `:is(${selector})`),
          out,
        )
      }
    } else if (isGrouping(rule) && admits(rule)) {
      collect(rule.cssRules, parents, out)
    }
  }
}

const OWN = "[data-morph],[data-morph-probe],#morph-preview"

/** Every declaration that reads a custom property, rebuilt when a stylesheet comes or goes. */
export class RuleIndex {
  private declared: Declared[] | undefined
  private readonly observer: MutationObserver

  constructor() {
    this.observer = new MutationObserver((records) => {
      const touchesSheets = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(
          (node) => node instanceof HTMLStyleElement || node instanceof HTMLLinkElement,
        ),
      )
      if (touchesSheets || records.some((record) => record.type === "characterData")) {
        this.declared = undefined
      }
    })
    this.observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  }

  get all(): readonly Declared[] {
    if (this.declared) return this.declared
    const out: Declared[] = []
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode instanceof Element && sheet.ownerNode.matches(OWN)) continue
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      collect(rules, [], out)
    }
    this.declared = out
    return out
  }

  dispose(): void {
    this.observer.disconnect()
  }
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector)
  } catch {
    return false
  }
}

const INHERITED = /^(color|font(-.*)?|line-height|letter-spacing|text-(align|transform|shadow))$/

/**
 * The graph token behind `value`: a `var()` of a graph token, or of a Tailwind internal whose own
 * declaration on `element` is one `var()` of a graph token.
 */
function tokensIn(
  value: string,
  element: Element,
  index: RuleIndex,
  graph: TokenGraph,
): TokenName[] {
  return referencesOf(value).flatMap((name) => {
    if (graph.has(name)) return [name]
    const own = index.all.find(
      (entry) => entry.property === name && entry.state === "rest" && matches(element, entry.base),
    )
    const inner = (own ? /^var\((--[\w-]+)\)$/.exec(own.value)?.[1] : undefined) as
      | TokenName
      | undefined
    return inner && graph.has(inner) ? [inner] : []
  })
}

interface Scan {
  index: RuleIndex
  graph: TokenGraph
  theme: RootState
}

function inlineDeclarations(element: Element): Declared[] {
  if (!(element instanceof HTMLElement)) return []
  return varDeclarations(element.style).map(([property, value]) => ({
    base: "*",
    state: "rest" as const,
    property,
    value,
  }))
}

/** Computed values with transitions off, so a hover fading in does not hide the rule that won. */
function settledStyle(element: Element): (property: string) => string {
  if (!(element instanceof HTMLElement)) {
    const style = getComputedStyle(element)
    return (property) => style.getPropertyValue(property)
  }
  const previous = element.style.getPropertyValue("transition")
  const priority = element.style.getPropertyPriority("transition")
  element.style.setProperty("transition", "none", "important")
  const style = getComputedStyle(element)
  const values = new Map<string, string>()
  const read = (property: string) => {
    const known = values.get(property)
    if (known !== undefined) return known
    const value = style.getPropertyValue(property)
    values.set(property, value)
    return value
  }
  read("color")
  queueMicrotask(() => {
    element.style.setProperty("transition", previous, priority)
  })
  return read
}

const LIVE_STATES: Partial<Record<ReadState, string>> = {
  hover: ":hover",
  "focus-visible": ":focus-visible",
  active: ":active",
}

/**
 * The tokens `element` reads through `var()`. A rest declaration counts when probing it gives the
 * element's computed value, or when the element sits in a hover or focus whose declaration does.
 */
function readsOn(
  element: Element,
  scan: Scan,
  via: Read["via"],
  only: (property: string) => boolean = () => true,
): Read[] {
  const actual = settledStyle(element)
  const inline = inlineDeclarations(element).filter((entry) => only(entry.property))
  const ruled = scan.index.all.filter(
    (entry) =>
      !entry.property.startsWith("--") && only(entry.property) && matches(element, entry.base),
  )
  const holds = (entry: Declared) =>
    probe(entry.property, entry.value, scan.theme) === actual(entry.property)
  const liveState = (property: string) =>
    ruled.some((entry) => {
      const state = LIVE_STATES[entry.state]
      return (
        entry.property === property &&
        state !== undefined &&
        matches(element, state) &&
        holds(entry)
      )
    })
  const out: Read[] = []
  const settled = new Set(inline.map((entry) => entry.property))
  const add = (entry: Declared, from: Read["via"]) => {
    for (const token of tokensIn(entry.value, element, scan.index, scan.graph)) {
      const seen = out.some(
        (read) =>
          read.property === entry.property && read.token === token && read.state === entry.state,
      )
      if (!seen) out.push({ property: entry.property, token, state: entry.state, via: from })
    }
  }
  for (const entry of inline) add(entry, "inline")
  for (const entry of ruled) {
    if (entry.state !== "rest") {
      add(entry, via)
      continue
    }
    if (settled.has(entry.property) || actual(entry.property) === "") continue
    if (tokensIn(entry.value, element, scan.index, scan.graph).length === 0) continue
    if (!holds(entry) && !liveState(entry.property)) continue
    settled.add(entry.property)
    add(entry, via)
  }
  return out
}

const atRest = (read: Read) => read.state === "rest"

/** The ds tokens `element` reads, each checked against its computed style for the rest state. */
export function readsOf(
  element: Element,
  index: RuleIndex,
  graph: TokenGraph,
  theme: RootState,
): Read[] {
  const scan: Scan = { index, graph, theme }
  const own = readsOn(element, scan, "rule")
  const restProps = new Set(own.filter(atRest).map((read) => read.property))
  const inherited: Read[] = []
  for (
    let parent = element.parentElement;
    parent && !restProps.has("color");
    parent = parent.parentElement
  ) {
    const missing = (property: string) => INHERITED.test(property) && !restProps.has(property)
    const found = readsOn(parent, scan, "inherited", missing).filter(atRest)
    for (const read of found) restProps.add(read.property)
    inherited.push(...found)
  }
  const background = restProps.has("background-color") ? [] : backgroundBehind(element, scan)
  return [...own, ...inherited, ...background]
}

/** The background the element's text sits on: the nearest ancestor that paints one from a token. */
function backgroundBehind(element: Element, scan: Scan): Read[] {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (getComputedStyle(parent).backgroundColor === "rgba(0, 0, 0, 0)") continue
    const found = readsOn(parent, scan, "inherited", (property) => property === "background-color")
    const rest = found.filter(atRest)
    if (rest.length > 0) return rest
  }
  return []
}
