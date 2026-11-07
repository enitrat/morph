import { type RootState } from "../core/config"

/** The live preview sheet; a probe measures without it. */
export const PREVIEW_STYLE_ID = "tune-preview"
const PROBE = "data-tune-probe"

let probeElement: HTMLElement | undefined
/** The theme attributes the probe carries now, dropped before the next theme's go on. */
let probeAttributes: readonly string[] = []

function probeNode(): HTMLElement {
  if (!probeElement?.isConnected) {
    probeElement = document.createElement("div")
    probeElement.setAttribute(PROBE, "")
    probeElement.setAttribute("aria-hidden", "true")
    probeElement.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none"
    document.documentElement.append(probeElement)
  }
  return probeElement
}

/**
 * The computed value of `property: expr` on an element that carries a theme's root state, with
 * the live preview set aside. The browser resolves `var()` and `color-mix()`, which core cannot.
 */
export function probe(property: string, expr: string, theme: RootState): string {
  const element = probeNode()
  return withoutPreview(() => {
    element.className = theme.classes.join(" ")
    for (const name of probeAttributes) element.removeAttribute(name)
    probeAttributes = Object.keys(theme.attributes)
    for (const [name, value] of Object.entries(theme.attributes)) element.setAttribute(name, value)
    element.style.setProperty(property, expr)
    const value = getComputedStyle(element).getPropertyValue(property)
    element.style.removeProperty(property)
    return value
  })
}

/** `read`, run with the live preview sheet disabled; a caller already inside one keeps it off. */
export function withoutPreview<T>(read: () => T): T {
  const sheet = document.querySelector<HTMLStyleElement>(`#${PREVIEW_STYLE_ID}`)?.sheet
  if (!sheet || sheet.disabled) return read()
  sheet.disabled = true
  try {
    return read()
  } finally {
    sheet.disabled = false
  }
}
