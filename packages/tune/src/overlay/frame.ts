import { isMeaningful, isTune } from "../inspector/target"
import { catalogNow } from "./catalog"
import { type Box } from "./place"
import { matchOf, nearestTo, type Scales, tokenAt } from "./scale"
import { fmt, specOf, type Spec, ownText } from "./specs"
import { componentOf } from "./tree"

const inside = (outer: Box, inner: DOMRect) =>
  inner.width > 0 &&
  inner.height > 0 &&
  inner.left >= outer.left - 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.bottom <= outer.bottom + 0.5

const outermost = (elements: readonly Element[]) =>
  elements.filter(
    (element) => !elements.some((other) => other !== element && other.contains(element)),
  )

/** The components fully inside a viewport box; the outermost meaningful elements on a page without any. */
export function itemsIn(box: Box, limit = 60): Element[] {
  const components: Element[] = []
  const meaningful: Element[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  let scanned = 0
  for (let node = walker.nextNode(); node !== null && scanned++ < 4000; node = walker.nextNode()) {
    if (!(node instanceof Element) || isTune(node)) continue
    if (!inside(box, node.getBoundingClientRect())) continue
    if (componentOf(node) !== null) components.push(node)
    else if (meaningful.length < limit * 4 && isMeaningful(node, catalogNow()))
      meaningful.push(node)
    if (components.length >= limit) break
  }
  return components.length > 0 ? components : outermost(meaningful).slice(0, limit)
}

/** One element measured for the frame's sheet. */
export interface Sample {
  element: Element
  /** The component it belongs to, which a finding names. */
  owner: Element | null
  spec: Spec
  text: string | null
}

const ownerOf = (element: Element): Element | null => {
  for (let node: Element | null = element; node !== null; node = node.parentElement)
    if (componentOf(node) !== null) return node
  return null
}

/** Every element the frame touches but does not wrap, measured once. */
export function samplesIn(box: Box, limit = 260): Sample[] {
  const samples: Sample[] = []
  for (const element of document.body.querySelectorAll("*")) {
    if (samples.length >= limit) break
    if (isTune(element) || element.matches("script,style,link,meta,noscript")) continue
    const r = element.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const hits =
      r.right > box.left && r.bottom > box.top && r.left < box.right && r.top < box.bottom
    const wraps =
      r.left <= box.left && r.top <= box.top && r.right >= box.right && r.bottom >= box.bottom
    if (hits && !wraps)
      samples.push({
        element,
        owner: ownerOf(element),
        spec: specOf(element),
        text: ownText(element),
      })
  }
  return samples
}

export interface Bucket {
  px: number
  token: string | null
  near: string | null
  count: number
}
export interface ColorBucket {
  css: string
  role: string | null
  uses: readonly string[]
  count: number
}
export interface TypeBucket {
  size: number
  lineHeight: string
  weight: string
  family: string
  sample: string
  count: number
}

/** One off-system value on one component, with every element that repeats it. */
export interface Instance {
  owner: Element | null
  prop: string
  value: string
  near: string | null
  elements: Element[]
}

export interface Finding {
  key: "radii" | "space" | "color"
  title: string
  detail: string
  swatches: readonly string[]
  instances: readonly Instance[]
  elements: readonly Element[]
  /** The words a Fix starts the composer with. */
  fix: string
}

export interface Sheet {
  measured: number
  spacing: readonly Bucket[]
  radii: readonly Bucket[]
  colors: readonly ColorBucket[]
  types: readonly TypeBucket[]
  findings: readonly Finding[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/**
 * What a frame holds: its spacing, radii, colours and type, and the values off the design system,
 * grouped the way a designer fixes them.
 */
export function sheetOf(samples: readonly Sample[], scales: Scales, components: number): Sheet {
  const spacing = new Map<number, Bucket>()
  const radii = new Map<number, Bucket>()
  const colors = new Map<
    string,
    { css: string; role: string | null; uses: Set<string>; count: number }
  >()
  const types = new Map<string, TypeBucket>()
  const off: (Instance & { kind: Finding["key"] })[] = []
  const flag = (
    sample: Sample,
    kind: Finding["key"],
    prop: string,
    value: string,
    near: string | null,
  ) => {
    const same = off.find(
      (entry) => entry.owner === sample.owner && entry.prop === prop && entry.value === value,
    )
    if (same) same.elements.push(sample.element)
    else off.push({ kind, owner: sample.owner, prop, value, near, elements: [sample.element] })
  }
  const count = (map: Map<number, Bucket>, px: number, scale: Scales["space"]) => {
    const bucket = map.get(px) ?? {
      px,
      token: tokenAt(px, scale),
      near: nearestTo(px, scale)?.name ?? null,
      count: 0,
    }
    bucket.count++
    map.set(px, bucket)
    return bucket
  }
  for (const sample of samples) {
    const { spec } = sample
    const lengths: [string, number][] = [...new Set(spec.padding)].map((value) => [
      "padding",
      value,
    ])
    if (spec.gap) lengths.push(["gap", spec.gap])
    for (const [prop, value] of lengths) {
      if (value <= 0) continue
      count(spacing, value, scales.space)
      if (matchOf(value, scales.space).kind === "off")
        flag(sample, "space", prop, `${fmt(value)}px`, nearestTo(value, scales.space)?.name ?? null)
    }
    if (spec.radius > 0 && spec.radius < 500) {
      count(radii, spec.radius, scales.radius)
      if (matchOf(spec.radius, scales.radius).kind === "off")
        flag(
          sample,
          "radii",
          "radius",
          `${fmt(spec.radius)}px`,
          nearestTo(spec.radius, scales.radius)?.name ?? null,
        )
    }
    const painted: [string, string | null][] = [
      ["text", spec.text],
      ["fill", spec.fill],
      ["border", spec.stroke],
    ]
    for (const [use, css] of painted) {
      if (css === null) continue
      const role = scales.colors.get(css) ?? null
      const bucket = colors.get(css) ?? { css, role, uses: new Set<string>(), count: 0 }
      bucket.uses.add(use)
      bucket.count++
      colors.set(css, bucket)
      if (role === null && scales.colors.size > 0) flag(sample, "color", use, css, null)
    }
    if (sample.text !== null) {
      const key = `${spec.font.size}/${spec.font.lineHeight}/${spec.font.weight}`
      const type = types.get(key) ?? { ...spec.font, sample: sample.text.slice(0, 32), count: 0 }
      type.count++
      types.set(key, type)
    }
  }
  const sheet = {
    measured: samples.length,
    spacing: [...spacing.values()].toSorted((a, b) => a.px - b.px),
    radii: [...radii.values()].toSorted((a, b) => a.px - b.px),
    colors: [...colors.values()]
      .map(({ uses, ...bucket }) => ({ ...bucket, uses: [...uses] }))
      .toSorted((a, b) => Number(a.role === null) - Number(b.role === null) || b.count - a.count),
    types: [...types.values()].toSorted((a, b) => b.size - a.size),
  }
  const findings: Finding[] = []
  const of = (kind: Finding["key"]) => off.filter((entry) => entry.kind === kind)
  if (sheet.radii.length > 1)
    findings.push({
      key: "radii",
      title: `${sheet.radii.length} different corner radii`,
      detail: sheet.radii.map((r) => r.token ?? `${fmt(r.px)}px`).join(" · "),
      swatches: [],
      instances: of("radii"),
      elements: samples
        .filter((s) => s.spec.radius > 0 && s.spec.radius < 500)
        .map((s) => s.element),
      fix: `Use one radius token across these ${plural(components, "component")}.`,
    })
  const space = of("space")
  if (space.length > 0) {
    const values = [...new Set(space.map((entry) => entry.value))]
    findings.push({
      key: "space",
      title: `${plural(space.length, "spacing value")} off the scale`,
      detail: values.join(" · "),
      swatches: [],
      instances: space,
      elements: space.flatMap((entry) => entry.elements),
      fix: `Snap padding and gaps to the spacing scale (${values.join(", ")} ${values.length > 1 ? "are" : "is"} off it).`,
    })
  }
  const raw = of("color")
  if (raw.length > 0) {
    const values = [...new Set(raw.map((entry) => entry.value))]
    findings.push({
      key: "color",
      title: `${plural(values.length, "raw colour")} off the palette`,
      detail: values.join(" · "),
      swatches: values,
      instances: raw,
      elements: raw.flatMap((entry) => entry.elements),
      fix: `Replace the raw colours (${values.join(", ")}) with palette tokens.`,
    })
  }
  return { ...sheet, findings }
}
