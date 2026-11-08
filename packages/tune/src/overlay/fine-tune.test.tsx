// @vitest-environment happy-dom
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { CONFIG, LIGHT, repoCatalog } from "../bridge/test-fixtures"
import { themeModelOf, toWire } from "../core"
import { connect } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { FineTune } from "./fine-tune"
import { clearPreview } from "./preview"
import { invalidateSources } from "./source"

afterEach(() => {
  invalidateCatalog()
  invalidateSources()
  clearPreview()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.head.querySelectorAll("style").forEach((style) => style.remove())
})

it("restores unconfirmed previews when switching scopes and folding a row", async () => {
  connect("/__tune")
  const writes: unknown[] = []
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/tokens")) return Response.json(toWire(repoCatalog(), CONFIG.tokens.themes))
    if (url.endsWith("/plumbing")) return Response.json({ plumbing: [] })
    if (url.endsWith("/locate")) return Response.json({ sources: [] })
    if (url.endsWith("/dial")) {
      writes.push(init?.body)
      return Response.json({ changed: true, file: "x.css" })
    }
    throw new Error(`unexpected request ${url}`)
  })
  const target = document.createElement("button")
  target.style.cssText =
    "background-color: var(--button-secondary-bg); padding-inline: var(--button-px-md);"
  document.body.append(target)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  root.render(
    createElement(FineTune, {
      target,
      theme: { name: LIGHT, themes: themeModelOf(CONFIG.tokens.themes) },
    }),
  )
  await vi.waitFor(() =>
    expect(
      host.querySelectorAll(".dial-line").length,
      host.textContent ?? "",
    ).toBeGreaterThanOrEqual(2),
  )
  const button = (text: string) => {
    const found = [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent?.includes(text) || entry.getAttribute("aria-label") === text,
    )
    if (!found) throw new Error(`missing ${text}: ${host.textContent}`)
    return found
  }
  button("Fill").click()
  await vi.waitFor(() => expect(host.textContent).toContain("Shared dark"))
  button("Shared dark").click()
  await vi.waitFor(() =>
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe(
      "Shared dark",
    ),
  )
  button("Increase Fill").click()
  await vi.waitFor(() => expect(host.textContent).toContain("Write it"))
  expect(document.querySelector("#tune-preview")?.textContent).toContain("var(--neutral-700)")
  button("Button").click()
  await vi.waitFor(() =>
    expect(document.querySelector("#tune-preview")?.textContent).toContain("var(--neutral-800)"),
  )
  button("Shared dark").click()
  await vi.waitFor(() =>
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe(
      "Shared dark",
    ),
  )
  button("Increase Fill").click()
  await vi.waitFor(() => expect(host.textContent).toContain("Write it"))
  button("Padding x").click()
  await vi.waitFor(() =>
    expect(document.querySelector("#tune-preview")?.textContent).toContain("var(--neutral-800)"),
  )
  expect(writes).toEqual([])
  root.unmount()
})
