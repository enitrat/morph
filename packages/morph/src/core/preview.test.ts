// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

import { CONFIG, DARK as DARK_THEME, LIGHT as LIGHT_THEME } from "../bridge/test-fixtures"
import { themeModelOf } from "./design-system"
import { type TokenEdit } from "./edit"
import { previewCss } from "./preview"

const themes = themeModelOf(CONFIG.tokens.themes)
const edits: TokenEdit[] = [
  { token: "--x", scope: LIGHT_THEME, to: "light-edit" },
  { token: "--y", scope: DARK_THEME, to: "dark-edit" },
]

// happy-dom does not inherit custom properties, so each element is read where a rule lands.
function render(stageClass: string, rootClass: string) {
  document.documentElement.className = rootClass
  document.head.innerHTML = `<style>${previewCss(themes, edits, { within: "[data-stage]" })}</style>`
  document.body.innerHTML = `<div data-stage class="${stageClass}"><p class="dark"></p></div><aside class="${rootClass}"></aside>`
  const read = (selector: string) => {
    const style = getComputedStyle(document.querySelector(selector) as Element)
    return { light: style.getPropertyValue("--x"), dark: style.getPropertyValue("--y") }
  }
  return { stage: read("[data-stage]"), nested: read("[data-stage] .dark"), outside: read("aside") }
}

const LIGHT = { light: "light-edit", dark: "" }
const DARK = { light: "", dark: "dark-edit" }
const NONE = { light: "", dark: "" }

afterEach(() => {
  document.documentElement.className = ""
  document.head.replaceChildren()
  document.body.replaceChildren()
})

it("previews only the active page theme, including after switching themes", () => {
  document.head.innerHTML = `<style>${previewCss(themes, edits, "page")}</style>`
  const root = document.documentElement
  root.className = "light"
  expect(getComputedStyle(root).getPropertyValue("--x")).toBe("light-edit")
  expect(getComputedStyle(root).getPropertyValue("--y")).toBe("")
  root.className = "dark"
  expect(getComputedStyle(root).getPropertyValue("--x")).toBe("")
  expect(getComputedStyle(root).getPropertyValue("--y")).toBe("dark-edit")
})

describe("a preview scoped to stages", () => {
  it("reaches a classless stage through the root's theme, and nothing outside a stage", () => {
    expect(render("", "dark")).toEqual({ stage: DARK, nested: DARK, outside: NONE })
    expect(render("", "light")).toEqual({ stage: LIGHT, nested: DARK, outside: NONE })
    expect(render("", "")).toEqual({ stage: LIGHT, nested: DARK, outside: NONE })
  })

  it("lets a stage's own theme win over the root's", () => {
    expect(render("light", "dark").stage).toEqual(LIGHT)
    expect(render("dark", "light").stage).toEqual(DARK)
  })
})
