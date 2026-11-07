import { PropControl } from "./props"

const OPEN = new Set(["(", "[", "{"])
const CLOSE = new Set([")", "]", "}"])

/** The index just past the bracket that closes the one at `open`, skipping strings. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at++) {
    const char = text[at] ?? ""
    if (char === '"' || char === "'" || char === "`") {
      at = text.indexOf(char, at + 1)
      if (at === -1) break
    } else if (OPEN.has(char)) depth++
    else if (CLOSE.has(char) && --depth === 0) return at + 1
  }
  throw new Error(`unbalanced ${text[open]} at ${open}`)
}

/** The parts of a list's text between its top-level commas, skipping strings and brackets. */
function partsOf(list: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let at = 0; at < list.length; at++) {
    const char = list[at] ?? ""
    if (char === '"' || char === "'" || char === "`") at = list.indexOf(char, at + 1)
    else if (OPEN.has(char)) at = closing(list, at) - 1
    else if (char === ",") {
      parts.push(list.slice(start, at))
      start = at + 1
    }
  }
  return [...parts, list.slice(start)].map((part) => part.trim()).filter((part) => part !== "")
}

const ENTRY = /^(?<quote>["'`]?)(?<key>[\w-]+)\k<quote>\s*:\s*(?<value>[\s\S]*)$/

/** The `key: value` pairs of an object literal's text, braces included. */
const entriesOf = (object: string): [string, string][] =>
  partsOf(object.slice(1, -1)).flatMap((part) => {
    const { key, value } = ENTRY.exec(part)?.groups ?? {}
    return key === undefined || value === undefined ? [] : [[key, value] as [string, string]]
  })

const unquote = (text: string) => text.replace(/^(["'`])(.*)\1$/s, "$2")

/** The object literal value of `key` in `object`, if it holds one. */
const objectAt = (object: string, key: string) =>
  entriesOf(object).find(([name, value]) => name === key && value.startsWith("{"))?.[1]

/** The `cva()` config object `component` reads through `VariantProps<typeof x>`, if any. */
function configOf(text: string, component: string): string | undefined {
  const name = component.replaceAll(/[.$]/g, String.raw`\$&`)
  const declared = new RegExp(String.raw`(?:function|const)\s+${name}\b`).exec(text)
  if (declared === null) return undefined
  const rest = text.slice(declared.index + declared[0].length)
  const next = /\n(?:export\s+)?(?:function|const)\s/.exec(rest)?.index ?? rest.length
  const variants = /VariantProps<typeof\s+(\w+)>/.exec(rest.slice(0, next))?.[1]
  if (variants === undefined) return undefined
  const call = new RegExp(String.raw`const\s+${variants}\s*=\s*cva\(`).exec(text)
  if (call === null) return undefined
  const open = call.index + call[0].length - 1
  return partsOf(text.slice(open + 1, closing(text, open) - 1)).find((arg) => arg.startsWith("{"))
}

/**
 * The enum and boolean props `component` takes from the `cva()` its props type reads, by reading
 * the source text, never running it: each variant in source order, a `true`/`false` variant as
 * on and off. A variant with no `defaultVariants` entry is left out, since writing the default
 * drops the attribute and a guessed default would write the wrong thing.
 */
export function cvaControls(text: string, component: string): PropControl[] {
  const config = configOf(text, component)
  const variants = config === undefined ? undefined : objectAt(config, "variants")
  if (config === undefined || variants === undefined) return []
  const defaultVariants = objectAt(config, "defaultVariants")
  const defaults = new Map(
    defaultVariants === undefined
      ? []
      : entriesOf(defaultVariants).map(([name, value]) => [name, unquote(value)]),
  )
  return entriesOf(variants).flatMap(([name, value]) => {
    const fallback = defaults.get(name)
    if (fallback === undefined || !value.startsWith("{")) return []
    const options = entriesOf(value).map(([option]) => option)
    const boolean = options.length === 2 && options.includes("true") && options.includes("false")
    return [
      PropControl.parse(
        boolean
          ? { kind: "boolean", name, default: fallback === "true" }
          : { kind: "enum", name, options, default: fallback },
      ),
    ]
  })
}
