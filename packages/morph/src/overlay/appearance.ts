import { useEffect, useState } from "react"

import { isMorph } from "../inspector/target"

export type Appearance = "light" | "dark"

let probe: CanvasRenderingContext2D | null = null

/** A CSS colour as sRGB 0–255 and alpha 0–1, whatever space the page wrote it in. */
function rgbaOf(color: string): [number, number, number, number] {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (probe === null) return [255, 255, 255, 1]
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r = 255, g = 255, b = 255, a = 255] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

/** OKLab lightness of an sRGB colour. */
function lightnessOf([r, g, b]: readonly number[]): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((v) => {
    const c = (v ?? 0) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * lr + 0.5363329497 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720453 * s
}

/** The first opaque background at a point, walking up from the page element under it. */
function groundAt(x: number, y: number): number | null {
  const hit = document.elementsFromPoint(x, y).find((element) => !isMorph(element))
  for (let node: Element | null = hit ?? document.body; node !== null; node = node.parentElement) {
    const rgba = rgbaOf(getComputedStyle(node).backgroundColor)
    if (rgba[3] > 0.5) return lightnessOf(rgba)
  }
  return null
}

/**
 * Light or dark, from what the host page paints where Morph's panels sit: a page whose ground is
 * at or below OKLab L 0.6 reads as dark. Falls back to the page's colour-scheme preference.
 */
export function hostAppearance(): Appearance {
  const points = [
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.25],
    [0.5, 0.95],
  ] as const
  const grounds = points
    .map(([fx, fy]) => groundAt(innerWidth * fx, innerHeight * fy))
    .filter((value): value is number => value !== null)
  if (grounds.length === 0)
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  const mean = grounds.reduce((sum, value) => sum + value, 0) / grounds.length
  return mean <= 0.6 ? "dark" : "light"
}

/** The host's appearance, re-read as Morph opens and when the page switches theme. */
export function useAppearance(open: boolean): Appearance {
  const [appearance, setAppearance] = useState<Appearance>("dark")
  useEffect(() => {
    const read = () => {
      setAppearance(hostAppearance())
    }
    read()
    const observer = new MutationObserver(read)
    for (const root of [document.documentElement, document.body])
      observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
    const scheme = matchMedia("(prefers-color-scheme: dark)")
    scheme.addEventListener("change", read)
    return () => {
      observer.disconnect()
      scheme.removeEventListener("change", read)
    }
  }, [open])
  return appearance
}
