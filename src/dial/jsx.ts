/** Where a JSX opening tag sits in a file: `<div …>` from its `<` through its `>`. */
interface Span {
  start: number
  end: number
}

function offsetOf(text: string, line: number, col: number): number | undefined {
  let at = 0
  for (let current = 1; current < line; current++) {
    const next = text.indexOf("\n", at)
    if (next === -1) return undefined
    at = next + 1
  }
  const end = text.indexOf("\n", at)
  return col - 1 <= (end === -1 ? text.length : end) - at ? at + col - 1 : undefined
}

/** Skips a quoted string starting at `at`, returning the index after its closing quote. */
function skipString(text: string, at: number): number {
  const quote = text[at]
  for (let index = at + 1; index < text.length; index++) {
    if (text[index] === "\\") index++
    else if (text[index] === quote) return index + 1
  }
  return text.length
}

/**
 * The opening tag at a 1-based `line:col`, the position a JSX call site maps to. Strings and `{…}`
 * expressions are skipped whole, so a `>` inside `className={a > b ? …}` does not end the tag.
 */
function openingTag(text: string, line: number, col: number): Span | undefined {
  const from = offsetOf(text, line, col)
  if (from === undefined) return undefined
  const start = text.indexOf("<", from)
  if (start === -1 || text.slice(from, start).trim() !== "") return undefined
  let depth = 0
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(text, index) - 1
    } else if (char === "{") depth++
    else if (char === "}") depth--
    else if (char === ">" && depth === 0) return { start, end: index + 1 }
  }
  return undefined
}

const SEPARATOR = String.raw`\s"'\x60`

/** `className` as a whole word of a class list: between quotes, backticks or whitespace. */
const word = (className: string, flags = "") =>
  new RegExp(
    `(?<=^|[${SEPARATOR}])${className.replaceAll(".", String.raw`\.`)}(?=$|[${SEPARATOR}])`,
    flags,
  )

const occurrences = (span: string, className: string) =>
  span.match(word(className, "g"))?.length ?? 0

/** Every class-like word the tag writes exactly once, so a swap of any of them is unambiguous. */
export function classesIn(text: string, line: number, col: number): string[] {
  const span = openingTag(text, line, col)
  if (span === undefined) return []
  const tag = text.slice(span.start, span.end)
  const words = tag.match(/[a-z][\w.-]*/g) ?? []
  return [...new Set(words)].filter((name) => occurrences(tag, name) === 1)
}

export type Swap = { ok: true; text: string; changed: boolean } | { ok: false; reason: string }

/**
 * `text` with `from` swapped for `to` in the tag at `line:col`. A tag that already writes `to`
 * and not `from` is the swap done before, so it answers unchanged.
 */
export function swapClass(text: string, line: number, col: number, from: string, to: string): Swap {
  const span = openingTag(text, line, col)
  if (span === undefined) return { ok: false, reason: `no JSX tag starts at ${line}:${col}` }
  const tag = text.slice(span.start, span.end)
  const count = occurrences(tag, from)
  if (count === 0 && occurrences(tag, to) === 1) return { ok: true, text, changed: false }
  if (count !== 1)
    return { ok: false, reason: `the tag at ${line}:${col} writes ${from} ${count} times` }
  const next = tag.replace(word(from), to)
  return { ok: true, text: text.slice(0, span.start) + next + text.slice(span.end), changed: true }
}

/** How an attribute's value is written. */
export type AttributeValue =
  | { kind: "literal"; value: string | boolean }
  /** `name={name}`: the enclosing component passes its own prop of the same name on. */
  | { kind: "forward" }
  | { kind: "code" }

/** One attribute of an opening tag, or a `{...spread}`, in source order. */
export type Attribute =
  | { kind: "attribute"; name: string; value: AttributeValue }
  | { kind: "spread" }

interface AttributeAt {
  attribute: Attribute
  /** From the whitespace before it, so removing `lead..end` leaves no gap. */
  lead: number
  start: number
  end: number
}

interface Tag {
  name: string
  /** Where the name ends: the place a new attribute goes. */
  nameEnd: number
  attributes: AttributeAt[]
}

/** The index after the `}` closing the `{` at `at`, skipping strings. */
function skipBraces(text: string, at: number): number {
  let depth = 0
  for (let index = at; index < text.length; index++) {
    const char = text[index]
    if (char === '"' || char === "'" || char === "`") index = skipString(text, index) - 1
    else if (char === "{") depth++
    else if (char === "}" && --depth === 0) return index + 1
  }
  return text.length
}

function expressionValue(source: string, name: string): AttributeValue {
  const inner = source.slice(1, -1).trim()
  if (inner === "true" || inner === "false") return { kind: "literal", value: inner === "true" }
  const quoted = /^(["'])([^"'\\]*)\1$/.exec(inner)
  if (quoted) return { kind: "literal", value: quoted[2] ?? "" }
  return inner === name ? { kind: "forward" } : { kind: "code" }
}

function attributeAt(text: string, at: number, end: number) {
  const name = /^[\w:-]+/.exec(text.slice(at, end))?.[0]
  if (name === undefined) return undefined
  const after = at + name.length
  if (text[after] !== "=")
    return { name, value: { kind: "literal", value: true } as const, end: after }
  const from = after + 1
  if (text[from] === "{") {
    const next = skipBraces(text, from)
    return { name, value: expressionValue(text.slice(from, next), name), end: next }
  }
  if (text[from] !== '"' && text[from] !== "'") return undefined
  const next = skipString(text, from)
  return {
    name,
    value: { kind: "literal", value: text.slice(from + 1, next - 1) } as const,
    end: next,
  }
}

function tagAt(text: string, line: number, col: number): Tag | undefined {
  const span = openingTag(text, line, col)
  if (span === undefined) return undefined
  const name = /^<([A-Za-z_$][\w.$:-]*)/.exec(text.slice(span.start, span.end))?.[1]
  if (name === undefined) return undefined
  const nameEnd = span.start + 1 + name.length
  const attributes: AttributeAt[] = []
  for (let at = nameEnd; at < span.end;) {
    const lead = at
    while (/\s/.test(text[at] ?? "")) at++
    const start = at
    if (text[at] === "/" || text[at] === ">") break
    if (text[at] === "{") {
      at = skipBraces(text, at)
      if (
        text
          .slice(start + 1, at - 1)
          .trim()
          .startsWith("...")
      )
        attributes.push({ attribute: { kind: "spread" }, lead, start, end: at })
      continue
    }
    const found = attributeAt(text, at, span.end)
    if (found === undefined) return undefined
    at = found.end
    const attribute: Attribute = { kind: "attribute", name: found.name, value: found.value }
    attributes.push({ attribute, lead, start, end: at })
  }
  return { name, nameEnd, attributes }
}

export function attributesIn(
  text: string,
  line: number,
  col: number,
): { name: string; attributes: Attribute[] } | undefined {
  const tag = tagAt(text, line, col)
  return tag && { name: tag.name, attributes: tag.attributes.map(({ attribute }) => attribute) }
}

const attributeText = (name: string, value: string | boolean) =>
  value === true ? name : value === false ? `${name}={false}` : `${name}="${value}"`

/**
 * `text` with the attribute `name` of the `<tagName …>` tag at `line:col` set to `to`, or removed
 * for `null`. Only a literal or absent attribute is written, and only where no spread after it can
 * set it.
 */
export function setAttribute(
  text: string,
  site: { line: number; col: number },
  tagName: string,
  name: string,
  to: string | boolean | null,
): Swap {
  const { line, col } = site
  const tag = tagAt(text, line, col)
  if (tag === undefined) return { ok: false, reason: `no JSX tag starts at ${line}:${col}` }
  if (tag.name !== tagName)
    return { ok: false, reason: `the tag at ${line}:${col} is <${tag.name}>, not <${tagName}>` }
  if (typeof to === "string" && !/^[\w -]*$/.test(to))
    return { ok: false, reason: `${JSON.stringify(to)} is not a plain value` }
  const named = tag.attributes.filter(
    ({ attribute }) => attribute.kind === "attribute" && attribute.name === name,
  )
  if (named.length > 1) return { ok: false, reason: `the tag writes ${name} ${named.length} times` }
  const [present] = named
  const index = present === undefined ? -1 : tag.attributes.indexOf(present)
  if (tag.attributes.some(({ attribute }, at) => attribute.kind === "spread" && at > index))
    return { ok: false, reason: `a spread in the tag can set ${name}` }
  const splice = (start: number, end: number, insert: string): Swap => ({
    ok: true,
    text: text.slice(0, start) + insert + text.slice(end),
    changed: true,
  })
  if (present === undefined)
    return to === null
      ? { ok: true, text, changed: false }
      : splice(tag.nameEnd, tag.nameEnd, ` ${attributeText(name, to)}`)
  const { attribute } = present
  if (attribute.kind !== "attribute" || attribute.value.kind !== "literal")
    return { ok: false, reason: `${name} is set by the code around it` }
  if (to === null) return splice(present.lead, present.end, "")
  if (attribute.value.value === to) return { ok: true, text, changed: false }
  return splice(present.start, present.end, attributeText(name, to))
}

const tagPattern = (tagName: string) =>
  new RegExp(String.raw`<${tagName.replaceAll(/[.$]/g, String.raw`\$&`)}(?=[\s/>])`, "g")

/**
 * Where the `<tagName` tag at `line:col` of `before` sits in `after`: the same one by order, since
 * formatting moves tags but never reorders them.
 */
export function movedTag(
  before: string,
  after: string,
  site: { line: number; col: number },
  tagName: string,
): { line: number; col: number } | undefined {
  const from = offsetOf(before, site.line, site.col)
  if (from === undefined) return undefined
  const start = before.indexOf("<", from)
  const order = [...before.matchAll(tagPattern(tagName))].findIndex((hit) => hit.index === start)
  const moved = order === -1 ? undefined : [...after.matchAll(tagPattern(tagName))][order]
  if (moved === undefined) return undefined
  const head = after.slice(0, moved.index)
  return { line: head.split("\n").length, col: moved.index - head.lastIndexOf("\n") }
}
