import { parseHex } from "./color"
import { type ThemeName } from "./config"
import { type TokenName, type Tokens } from "./design-system"
import { currentValue, SIZES } from "./edit"
import { chainOf, referencesOf, normalizeValue, resolve } from "./graph"

export type Display =
  /** Painted as a swatch; the browser resolves a `color-mix()`. */
  | { kind: "color"; css: string }
  | { kind: "length"; px: number }
  /** A step of a named scale: `md`, `full`. */
  | { kind: "name"; text: string }
  | { kind: "raw"; text: string }

const REM_PX = 16
const COLOR = /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix|color)\()/i

interface Quantity {
  value: number
  sized: boolean
}

/** Evaluates `px`, `rem` and unitless numbers under `calc()`, `+ - * /` and parentheses. */
export function lengthOf(text: string): number | undefined {
  const tokens = text.match(/calc\(|\d*\.?\d+(?:px|rem)?|[()*/+-]/g) ?? []
  if (tokens.join("") !== text.replaceAll(/\s+/g, "")) return undefined
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]

  function factor(): Quantity | undefined {
    const token = take()
    if (token === "calc(" || token === "(") {
      const inner = sum()
      return take() === ")" ? inner : undefined
    }
    const match = /^(\d*\.?\d+)(px|rem)?$/.exec(token ?? "")
    if (!match) return undefined
    const value = Number(match[1])
    if (match[2] === "rem") return { value: value * REM_PX, sized: true }
    return { value, sized: match[2] === "px" }
  }

  function product(): Quantity | undefined {
    let left = factor()
    while (left && (peek() === "*" || peek() === "/")) {
      const op = take()
      const right = factor()
      if (!right || (op === "/" && right.sized) || (left.sized && right.sized)) return undefined
      left = {
        value: op === "*" ? left.value * right.value : left.value / right.value,
        sized: left.sized || right.sized,
      }
    }
    return left
  }

  function sum(): Quantity | undefined {
    let left = product()
    while (left && (peek() === "+" || peek() === "-")) {
      const op = take()
      const right = product()
      if (!right || right.sized !== left.sized) return undefined
      left = {
        value: op === "+" ? left.value + right.value : left.value - right.value,
        sized: left.sized,
      }
    }
    return left
  }

  const result = sum()
  return result?.sized && at === tokens.length ? result.value : undefined
}

/** The size name of the scale step `value` aliases down to: `md` for `var(--radius-md)`. */
function nameOf(tokens: Tokens, value: string, theme: ThemeName): string | undefined {
  const alias = /^var\((--[\w-]+)\)$/.exec(value)?.[1] as TokenName | undefined
  if (alias === undefined || !tokens.graph.has(alias)) return undefined
  const step = chainOf(tokens, alias, theme).at(-1) ?? alias
  if (referencesOf(currentValue(tokens, step, theme)).length > 0) return undefined
  const suffix = step.split("-").at(-1) ?? ""
  return SIZES.includes(suffix) ? suffix : undefined
}

/** `value` as a designer reads it in `theme`: a swatch, `16 px`, `md`, or the value itself. */
export function displayOf(tokens: Tokens, value: string, theme: ThemeName): Display {
  const normalized = normalizeValue(value)
  const resolved = normalizeValue(resolve(tokens, normalized, theme))
  if (parseHex(resolved) || COLOR.test(resolved)) return { kind: "color", css: resolved }
  const name = nameOf(tokens, normalized, theme)
  if (name !== undefined) return { kind: "name", text: name }
  const px = lengthOf(resolved)
  if (px !== undefined) return { kind: "length", px }
  return { kind: "raw", text: normalized }
}
