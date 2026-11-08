import { useEffect, useState } from "react"

import { type ThemeModel, themeModelOf } from "../core/design-system"
import { type ThemeName } from "../core/config"
import { loadTokens } from "./catalog"
import { EDGE, PANEL_WIDTH, TAB } from "./geometry"
import { endThemePreview, previewTheme } from "./preview"
import { askedTheme, type Stage } from "./state"

/** A theme the page shows, with the design system's themes it is one of. */
export interface ShownTheme {
  name: ThemeName
  themes: ThemeModel
}

/** The design system's themes once the bridge answers; `null` until then, or while it cannot. */
export function useThemes(
  open: boolean,
  stage: Stage["kind"],
  targets: readonly Element[],
): ThemeModel | null {
  const [themes, setThemes] = useState<ThemeModel | null>(null)
  useEffect(() => {
    const stop = new AbortController()
    if (!open)
      return () => {
        stop.abort()
      }
    void (async () => {
      const answer = await loadTokens()
      if (!stop.signal.aborted && answer.ok) setThemes(themeModelOf(answer.value.themes))
    })()
    return () => {
      stop.abort()
    }
  }, [open, stage, targets])
  return themes
}

/**
 * The theme the page shows while a session is open: the one the designer chose in the panel,
 * else the one their words named, else the page's own (`null`). The page gets its theme back
 * when the session ends.
 */
export function usePageTheme(
  stage: Stage,
  themes: ThemeModel | null,
): { shown: ThemeName | null; choose: (theme: ThemeName) => void } {
  const [chosen, setChosen] = useState<{ id: string; theme: ThemeName } | null>(null)
  const session = stage.kind === "session" ? stage : null
  const shown =
    session === null || themes === null
      ? null
      : chosen?.id === session.id
        ? chosen.theme
        : askedTheme(
            session.draft.words,
            themes.list.map((theme) => theme.name),
          )
  useEffect(() => {
    if (shown === null || themes === null) return undefined
    previewTheme(themes, shown)
    return endThemePreview
  }, [shown, themes])
  return {
    shown,
    choose: (theme) => {
      if (session !== null) setChosen({ id: session.id, theme })
    },
  }
}

export type Side = "left" | "right" | "bottom"

/**
 * Where the docked panel goes so it covers none of `boxes`: the side with more free room beside
 * them, when the panel fits there; along the bottom when it fits beside neither.
 */
export function sideFor(boxes: readonly Pick<DOMRect, "left" | "right">[], width: number): Side {
  if (boxes.length === 0) return "right"
  const left = Math.min(...boxes.map((box) => box.left))
  const right = width - Math.max(...boxes.map((box) => box.right))
  const fitsLeft = left >= PANEL_WIDTH + 2 * EDGE
  const fitsRight = right >= PANEL_WIDTH + TAB + EDGE
  if (fitsLeft && fitsRight) return left > right ? "left" : "right"
  if (fitsLeft) return "left"
  return fitsRight ? "right" : "bottom"
}

const COLLAPSED_KEY = "tune:collapsed"

function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === "true"
  } catch {
    return false
  }
}

/** Whether the session panel is folded to its pill, kept for the page session. */
export function useCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  return [
    collapsed,
    (next) => {
      setCollapsed(next)
      try {
        sessionStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        // Without storage the panel opens unfolded on the next load.
      }
    },
  ]
}
