import { activationOf, type ThemeModel, themeNamed } from "../core/design-system"
import { type ThemeName } from "../core/config"
import { PREVIEW_STYLE_ID } from "../inspector/probe"
import { SENTINEL } from "../widget/sentinel"

const tokens = new Map<string, string>()
/** Each touched element's inline values from before its first dial, restored on clear. */
const inline = new Map<HTMLElement, Map<string, { value: string; priority: string }>>()

function sheet(): HTMLStyleElement {
  const found = document.querySelector(`#${PREVIEW_STYLE_ID}`)
  if (found instanceof HTMLStyleElement) return found
  const style = document.createElement("style")
  style.id = PREVIEW_STYLE_ID
  style.dataset.tune = SENTINEL
  document.head.append(style)
  return style
}

/** Sets one dial's rules, replacing what that dial previewed before. */
export function previewToken(key: string, css: string): void {
  tokens.set(key, css)
  sheet().textContent = [...tokens.values()].join("\n")
}

export function previewClass(element: HTMLElement, css: Readonly<Record<string, string>>): void {
  let saved = inline.get(element)
  if (saved === undefined) {
    saved = new Map()
    inline.set(element, saved)
  }
  for (const [property, value] of Object.entries(css)) {
    if (!saved.has(property)) {
      saved.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      })
    }
    element.style.setProperty(property, value, "important")
  }
}

/** Marks the page while Tune shows it in another theme, so the overlay keeps the page's own. */
export const THEME_PREVIEW = "tuneTheme"

let restoreTheme: (() => void) | null = null

/**
 * Shows the page in `theme` until `endThemePreview`: `<html>` drops every class and attribute any
 * theme's selector names, then takes the ones `theme`'s does.
 */
export function previewTheme(themes: ThemeModel, theme: ThemeName): void {
  endThemePreview()
  const root = document.documentElement
  const state = activationOf(themeNamed(themes, theme))
  const states = themes.list.flatMap((entry) => entry.activations)
  const attributes = [...new Set(states.flatMap((entry) => Object.keys(entry.attributes)))]
  const before = {
    classes: root.className,
    attributes: attributes.map((name) => [name, root.getAttribute(name)] as const),
    scheme: root.style.colorScheme,
  }
  for (const entry of states) root.classList.remove(...entry.classes)
  for (const name of attributes) root.removeAttribute(name)
  root.classList.add(...state.classes)
  for (const [name, value] of Object.entries(state.attributes)) root.setAttribute(name, value)
  // Native controls follow Tailwind's dark variant, the `dark` class.
  root.style.colorScheme = state.classes.includes("dark") ? "dark" : "light"
  root.dataset[THEME_PREVIEW] = theme
  restoreTheme = () => {
    root.className = before.classes
    for (const [name, value] of before.attributes)
      if (value === null) root.removeAttribute(name)
      else root.setAttribute(name, value)
    root.style.colorScheme = before.scheme
    delete root.dataset[THEME_PREVIEW]
  }
}

export function endThemePreview(): void {
  restoreTheme?.()
  restoreTheme = null
}

export function clearPreview(): void {
  tokens.clear()
  document.querySelector(`#${PREVIEW_STYLE_ID}`)?.remove()
  for (const [element, saved] of inline) {
    for (const [property, { value, priority }] of saved) {
      if (value === "") element.style.removeProperty(property)
      else element.style.setProperty(property, value, priority)
    }
  }
  inline.clear()
}
