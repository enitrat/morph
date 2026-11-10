import { z } from "zod"

import { jsxTags } from "../syntax/source"

/** Where a JSX opening tag sits in a file: `<div …>` from its `<` through its `>`. */
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

/** Finds the JSX opening tag at a 1-based source location. */
function openingTag(text: string, line: number, col: number) {
  const from = offsetOf(text, line, col)
  if (from === undefined) return undefined
  return jsxTags(text).find(({ start }) => start >= from && text.slice(from, start).trim() === "")
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

/** Every class-like word the tag writes exactly once. */
export function classesIn(text: string, line: number, col: number): string[] {
  const tag = openingTag(text, line, col)
  if (!tag) return []
  const spans = tag.classSpans
  const values = spans.map(({ start, end }) => text.slice(start, end))
  const words = values.flatMap((value) => value.match(/[a-z][\w.-]*/g) ?? [])
  return [...new Set(words)].filter(
    (name) => values.reduce((sum, value) => sum + occurrences(value, name), 0) === 1,
  )
}

export type Swap = { ok: true; text: string; changed: boolean } | { ok: false; reason: string }

/** Swaps one class in the source strings of the selected JSX tag. */
export function swapClass(text: string, line: number, col: number, from: string, to: string): Swap {
  const tag = openingTag(text, line, col)
  if (!tag) return { ok: false, reason: `no JSX tag starts at ${line}:${col}` }
  const spans = tag.classSpans
  const count = (name: string) =>
    spans.reduce((sum, { start, end }) => sum + occurrences(text.slice(start, end), name), 0)
  const found = count(from)
  if (found === 0 && count(to) === 1) return { ok: true, text, changed: false }
  if (found !== 1)
    return { ok: false, reason: `the tag at ${line}:${col} writes ${from} ${found} times` }
  const span = spans.find(({ start, end }) => occurrences(text.slice(start, end), from) === 1)
  if (!span) return { ok: false, reason: `the tag at ${line}:${col} writes ${from} 0 times` }
  const next = text.slice(span.start, span.end).replace(word(from), to)
  return { ok: true, text: text.slice(0, span.start) + next + text.slice(span.end), changed: true }
}

/** How an attribute's value is written. */
export const AttributeValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.union([z.string(), z.boolean()]) }),
  z.object({ kind: z.literal("forward") }),
  z.object({ kind: z.literal("code") }),
])
export type AttributeValue = z.infer<typeof AttributeValue>

/** One attribute of an opening tag, or a `{...spread}`, in source order. */
export const Attribute = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attribute"), name: z.string(), value: AttributeValue }),
  z.object({ kind: z.literal("spread") }),
])
export type Attribute = z.infer<typeof Attribute>

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

function tagAt(text: string, line: number, col: number): Tag | undefined {
  const span = openingTag(text, line, col)
  if (!span) return undefined
  const tag = span
  let previousEnd = tag.nameEnd
  const attributes = tag.attributes.map((item): AttributeAt => {
    const lead = text.slice(previousEnd, item.start).trim() === "" ? previousEnd : item.start
    previousEnd = item.end
    if (item.name === undefined)
      return { attribute: { kind: "spread" }, lead, start: item.start, end: item.end }
    const value = item.value ?? { kind: "code" }
    return {
      attribute: { kind: "attribute", name: item.name, value },
      lead,
      start: item.start,
      end: item.end,
    }
  })
  return { name: tag.name, nameEnd: tag.nameEnd, attributes }
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
  const tags = jsxTags(before).filter((tag) => tag.name === tagName)
  const order = tags.findIndex(
    (tag) => tag.start >= from && before.slice(from, tag.start).trim() === "",
  )
  const moved =
    order === -1 ? undefined : jsxTags(after).filter((tag) => tag.name === tagName)[order]
  if (moved === undefined) return undefined
  const head = after.slice(0, moved.start)
  return { line: head.split("\n").length, col: moved.start - head.lastIndexOf("\n") }
}
