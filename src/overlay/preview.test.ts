// @vitest-environment happy-dom
import { expect, it } from "vitest"

import { CONFIG, DARK } from "../bridge/test-fixtures"
import { themeModelOf } from "../core"
import { endThemePreview, previewTheme } from "./preview"

it("shows a light page in dark while a Dark track is in use, then gives the page back", () => {
  const root = document.documentElement
  root.className = "light font-sans"
  root.style.colorScheme = "light"

  previewTheme(themeModelOf(CONFIG.tokens.themes), DARK)
  expect([...root.classList]).toEqual(["font-sans", "dark"])
  expect(root.style.colorScheme).toBe("dark")
  expect(root.dataset.retouchTheme).toBe("dark")

  endThemePreview()
  expect(root.className).toBe("light font-sans")
  expect(root.style.colorScheme).toBe("light")
  expect(root.dataset.retouchTheme).toBeUndefined()
})
