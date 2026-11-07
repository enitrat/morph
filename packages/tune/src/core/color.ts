export type Rgb = readonly [number, number, number]

export function parseHex(hex: string): Rgb | undefined {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim())
  if (!match) return undefined
  const channel = (index: number) => Number.parseInt(match[index] ?? "0", 16)
  return [channel(1), channel(2), channel(3)]
}

const gamma = (c: number) => (c <= 0.003_130_8 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
/** A linear-light channel as an 8-bit sRGB one, clipped to the gamut. */
const toByte = (value: number) => Math.round(255 * Math.min(1, Math.max(0, gamma(value))))

/** `oklch(62% 0.2 30)` or `oklch(0.62 0.2 30 / 0.5)` in sRGB, clipped to its gamut. */
function parseOklch(text: string): Rgb | undefined {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/[^)]*)?\)$/i.exec(
    text.trim(),
  )
  if (!match) return undefined
  const l = Number(match[1]) / (match[2] === "%" ? 100 : 1)
  const chroma = Number(match[3])
  const hue = (Number(match[4]) * Math.PI) / 180
  const [a, b] = [chroma * Math.cos(hue), chroma * Math.sin(hue)]
  const lc = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3
  const mc = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3
  const sc = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3
  return [
    toByte(4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc),
    toByte(-1.268_438_004_6 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc),
    toByte(-0.004_196_086_3 * lc - 0.703_418_614_7 * mc + 1.707_614_701 * sc),
  ]
}

/** A solid colour Tune can order: a six-digit hex or an `oklch()`. */
export const parseColor = (text: string): Rgb | undefined => parseHex(text) ?? parseOklch(text)

const linear = (channel: number) => {
  const c = channel / 255
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** OKLab lightness, 0 to 1: the order a ramp reads in. */
export function lightness([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.412_221_470_8 * lr + 0.536_332_536_3 * lg + 0.051_445_992_9 * lb)
  const m = Math.cbrt(0.211_903_498_2 * lr + 0.680_699_545_1 * lg + 0.107_396_956_6 * lb)
  const s = Math.cbrt(0.088_302_461_9 * lr + 0.281_718_837_6 * lg + 0.629_978_700_5 * lb)
  return 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s
}

/** WCAG 2 AA: text needs 4.5:1, UI boundaries 3:1. */
export function contrastGrade(ratio: number): "text" | "ui" | "fail" {
  if (ratio >= 4.5) return "text"
  return ratio >= 3 ? "ui" : "fail"
}

export const GRADE_LABEL = { text: "AA text", ui: "3:1 UI only", fail: "below 3:1" } as const
