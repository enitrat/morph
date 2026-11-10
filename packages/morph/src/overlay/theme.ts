import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { type ThemeName } from "../core/config"
import { type ThemeModel, themeModelOf, themeOfRoot } from "../core/design-system"
import { loadTokens } from "./catalog"
import { THEME_PREVIEW } from "./preview"

/** A theme the page shows, with the design system's themes it is one of. */
export interface ShownTheme {
  name: ThemeName
  themes: ThemeModel
}

/** The design system's themes once the bridge answers; `null` until then, or while it cannot. */
function useThemes(open: boolean): ThemeModel | null {
  const [themes, setThemes] = useState<ThemeModel | null>(null)
  useEffect(() => {
    if (!open) return undefined
    let live = true
    void loadTokens().then((answer) => {
      if (live && answer.ok) setThemes(themeModelOf(answer.value.themes))
    })
    return () => {
      live = false
    }
  }, [open])
  return themes
}

/** `<html>`'s attributes as the page last set them; a theme Morph previews leaves it unchanged. */
let hostRoot = "[]"
const hostRootNow = () => {
  const root = document.documentElement
  if (root.dataset[THEME_PREVIEW] === undefined)
    hostRoot = JSON.stringify([...root.attributes].map(({ name, value }) => [name, value]))
  return hostRoot
}
const watchHostRoot = (changed: () => void) => {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true })
  return () => {
    observer.disconnect()
  }
}

/** The theme the host page shows now, which the dials morph; `null` until the themes load. */
export function useHostTheme(open: boolean): ShownTheme | null {
  const themes = useThemes(open)
  const root = useSyncExternalStore(watchHostRoot, hostRootNow, () => "[]")
  return useMemo(() => {
    if (themes === null) return null
    const { class: names = "", ...attributes } = Object.fromEntries(
      JSON.parse(root) as [string, string][],
    )
    const classes = new Set(names.split(/\s+/).filter(Boolean))
    return { name: themeOfRoot(themes, { classes, attributes }), themes }
  }, [root, themes])
}
