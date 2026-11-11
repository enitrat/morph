import { type RefObject, useLayoutEffect } from "react"

/** The lab's chosen glass (site/lab/saved/glass-1.json): bend, bezel, rim light. */
const GLASS = {
  bend: 1.5,
  bezel: 14,
  ior: 1.5,
  fringe: 0.4,
  frost: 18,
  vibrancy: 1.6,
  rim: 0.5,
  light: 215,
} as const

/** Only Chromium runs an SVG filter as a backdrop-filter; elsewhere `.glass` keeps its frost. */
const BENDS =
  typeof navigator !== "undefined" &&
  ((
    navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }
  ).userAgentData?.brands.some(({ brand }) => brand.includes("Chrom")) ??
    false)

/** A lip bezel: convex at the rim, easing into a shallow dip before the flat top. */
function profile(t: number): number {
  const convex = (1 - (1 - t) ** 4) ** 0.25
  const e = t * t * t * (t * (t * 6 - 15) + 10)
  return convex * (1 - e) + (1 - convex) * e * 0.4 + convex * e * 0.6
}

const slopeAt = (t: number, h: number) =>
  (profile(Math.min(1, t + h)) - profile(Math.max(0, t - h))) / (2 * h)

/**
 * How far a vertical ray lands from where it entered, per depth into the bezel, normalized to a
 * peak of 1: it meets the slope, refracts into glass of index `ior` (Snell), and the deviation
 * carries over the glass's height there. After kube.io's "Liquid Glass in the Browser".
 */
const BEND = (() => {
  const out = new Float32Array(128)
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const t = Math.min(0.999, Math.max(0.001, i / (out.length - 1)))
    const incident = Math.atan(Math.abs(slopeAt(t, 0.001)))
    const refracted = Math.asin(Math.sin(incident) / GLASS.ior)
    out[i] = profile(t) * Math.tan(incident - refracted)
    peak = Math.max(peak, out[i] ?? 0)
  }
  return out.map((value) => value / peak)
})()

interface Surface {
  /** R = x and G = y displacement, 128 = still. */
  bend: string
  /** White, its alpha the rim light. */
  lit: string
  bezel: number
}

const surfaces = new Map<string, Surface>()

/** The displacement and rim-light maps for one rounded rectangle, cached by size and radius. */
function surfaceOf(w: number, h: number, r: number): Surface {
  const key = `${w}:${h}:${r}`
  const hit = surfaces.get(key)
  if (hit) return hit
  const bezel = Math.min(GLASS.bezel, Math.max(r, 4), w / 2, h / 2)
  const lx = Math.cos((GLASS.light * Math.PI) / 180)
  const ly = Math.sin((GLASS.light * Math.PI) / 180)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext("2d")
  if (context === null) return { bend: "", lit: "", bezel }
  const bend = context.createImageData(w, h)
  const lit = context.createImageData(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const qx = Math.abs(x + 0.5 - w / 2) - (w / 2 - r)
      const qy = Math.abs(y + 0.5 - h / 2) - (h / 2 - r)
      const sx = x + 0.5 < w / 2 ? -1 : 1
      const sy = y + 0.5 < h / 2 ? -1 : 1
      let depth: number
      let nx = 0
      let ny = 0
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy)
        depth = r - length
        nx = (qx / length) * sx
        ny = (qy / length) * sy
      } else if (qx > qy) {
        depth = r - qx
        nx = sx
      } else {
        depth = r - qy
        ny = sy
      }
      const i = (y * w + x) * 4
      bend.data[i + 2] = 128
      bend.data[i + 3] = 255
      if (depth < 0 || depth >= bezel) {
        bend.data[i] = 128
        bend.data[i + 1] = 128
        continue
      }
      const t = depth / bezel
      const m = BEND[Math.min(127, Math.round(t * 127))] ?? 0
      bend.data[i] = Math.round(128 - nx * m * 127)
      bend.data[i + 1] = Math.round(128 - ny * m * 127)
      const facing = nx * lx + ny * ly
      const glint = Math.max(0, facing) ** 2 + 0.45 * Math.max(0, -facing) ** 2
      const alpha = GLASS.rim * glint * Math.min(1, slopeAt(t, 0.01) / 3) * (1 - t) ** 1.5
      lit.data[i] = 255
      lit.data[i + 1] = 255
      lit.data[i + 2] = 255
      lit.data[i + 3] = Math.round(Math.min(1, alpha) * 255)
    }
  context.putImageData(bend, 0, 0)
  const bendUrl = canvas.toDataURL()
  context.clearRect(0, 0, w, h)
  context.putImageData(lit, 0, 0)
  const made = { bend: bendUrl, lit: canvas.toDataURL(), bezel }
  surfaces.set(key, made)
  return made
}

const SVG = "http://www.w3.org/2000/svg"
let count = 0

/**
 * Frosts, bends and saturates the backdrop, with a slight colour fringe from bending red more than
 * blue. A fresh id each time: Safari caches filter output by id.
 */
function filterIn(defs: SVGSVGElement, w: number, h: number, surface: Surface): string {
  const id = `morph-glass-${++count}`
  const scale = 2 * GLASS.bend * surface.bezel * 0.6
  const spread = GLASS.fringe * 0.12
  const channel = (name: string, factor: number, keep: number) => {
    const matrix = [0, 1, 2]
      .map((n) => [0, 1, 2, 3, 4].map((m) => (n === keep && m === n ? 1 : 0)).join(" "))
      .join(" ")
    return `<feDisplacementMap in="frost" in2="map" scale="${(scale * factor).toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="${name}d"/>
      <feColorMatrix in="${name}d" type="matrix" values="${matrix} 0 0 0 1 0" result="${name}"/>`
  }
  const filter = document.createElementNS(SVG, "filter")
  filter.id = id
  for (const [name, value] of Object.entries({
    x: "0",
    y: "0",
    width: String(w),
    height: String(h),
    filterUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  }))
    filter.setAttribute(name, value)
  filter.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${GLASS.frost / 2}" result="frost"/>
    <feImage href="${surface.bend}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    ${channel("r", 1 + spread, 0)}${channel("g", 1, 1)}${channel("b", 1 - spread, 2)}
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen" result="bent"/>
    <feColorMatrix in="bent" type="saturate" values="${GLASS.vibrancy}"/>`
  defs.append(filter)
  return id
}

/** The overlay's filter store: an `<svg>` in the same shadow tree, so `url(#id)` resolves. */
function defsOf(element: Element): SVGSVGElement | null {
  const root = element.getRootNode()
  const defs = (root instanceof ShadowRoot || root instanceof Document ? root : document).querySelector(
    "svg[data-morph-glass]",
  )
  return defs instanceof SVGSVGElement ? defs : null
}

/**
 * Makes a `.glass` element liquid glass: its rim lit from its own shape everywhere, and in
 * Chromium its backdrop bent at the rim. Follows the element as it resizes.
 */
export function useGlass(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    let filter: string | null = null
    let shape = ""
    const paint = () => {
      const w = Math.round(element.offsetWidth)
      const h = Math.round(element.offsetHeight)
      const r = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, w / 2, h / 2)
      if (w < 2 || h < 2 || `${w}:${h}:${r}` === shape) return
      shape = `${w}:${h}:${r}`
      const surface = surfaceOf(w, h, r)
      element.style.backgroundImage = surface.lit === "" ? "" : `url(${surface.lit})`
      const defs = BENDS ? defsOf(element) : null
      if (defs === null || surface.bend === "") return
      if (filter !== null) defs.querySelector(`#${filter}`)?.remove()
      filter = filterIn(defs, w, h, surface)
      element.style.backdropFilter = `url(#${filter})`
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (filter !== null) defsOf(element)?.querySelector(`#${filter}`)?.remove()
    }
  }, [ref])
}
