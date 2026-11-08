// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:3000/"}
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { themeModelOf } from "../core/design-system"
import { ThemeName } from "../core/config"
import { connect } from "./bridge"
import { catalogNow, invalidateCatalog } from "./catalog"
import { type Actions, PanelBody } from "./panel"
import { invalidateSources } from "./source"
import { initial, reduce } from "./state"

const themes = { shared: [], list: [{ name: ThemeName.parse("light"), selectors: [":root"] }] }
const actions: Actions = {
  send() {},
  cancel() {},
  flip() {},
  retry() {},
  keep() {},
  discard() {},
  refine() {},
  sendRefine() {},
  retryRefine() {},
  back() {},
}

afterEach(() => {
  invalidateCatalog()
  invalidateSources()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it("refreshes metadata and row values when the same element is picked again", async () => {
  connect("/__tune")
  function Button() {}
  const component = {
    type: Button,
    return: null,
    child: null,
    memoizedProps: { size: "sm" },
    stateNode: null,
    _debugOwner: null,
    _debugStack: { stack: "Error\n    at X (http://localhost:3000/chunk.js:10:1)" },
  }
  const target = document.createElement("button")
  Object.assign(target, {
    __reactFiber$test: { ...component, type: "button", return: component, stateNode: target },
  })
  document.body.append(target)
  let options = ["sm", "lg"]
  let title = "Button"
  let line = 10
  let requests = 0
  let tokenRequests = 0
  let attributeRequests = 0
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.includes("/tokens")) {
      tokenRequests++
      return Response.json({
        files: [],
        themes,
        plumbing: [],
        components: [
          {
            slug: "button",
            title,
            group: "ui",
            naming: "own",
            href: null,
            importFrom: null,
            exports: ["Button"],
            namedExports: ["Button"],
            files: [],
            reads: [],
            childReads: [],
            props: { kind: "none" },
          },
        ],
      })
    }
    if (url.includes("/props")) {
      requests++
      return Response.json({ controls: [{ kind: "enum", name: "size", options, default: "sm" }] })
    }
    if (url.includes("/plumbing")) return Response.json({ plumbing: [] })
    if (url.includes("/locate"))
      return Response.json({ sources: [{ path: "src/app.tsx", line, col: 1 }] })
    if (url.includes("/attributes")) {
      attributeRequests++
      return Response.json({ tag: { name: "Button", attributes: [] } })
    }
    if (url.includes("/uses")) return Response.json({ uses: 1, examples: 0 })
    if (url.includes("/tag")) return Response.json({ tag: null })
    throw new Error(`unexpected request ${url}`)
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let state = reduce(initial, { kind: "picked", element: target, add: false })
  const render = () =>
    root.render(
      createElement(PanelBody, {
        stage: state.stage,
        dispatch: () => {},
        actions,
        theme: { name: ThemeName.parse("light"), themes: themeModelOf(themes) },
      }),
    )
  render()
  await vi.waitFor(() => expect(host.textContent).toContain("lg"))
  expect(host.textContent).not.toContain("xl")
  options = ["sm", "lg", "xl"]
  component.memoizedProps.size = "xl"
  title = "Updated Button"
  line = 11
  invalidateCatalog()
  invalidateSources()
  state = reduce(state, { kind: "picked", element: target, add: false })
  render()
  await vi.waitFor(() => expect(host.textContent).toContain("xl"))
  expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe("xl")
  expect(catalogNow().get("Button")?.title).toBe("Updated Button")
  expect(host.textContent).toContain("app.tsx:11")
  expect(requests).toBe(2)
  expect(tokenRequests).toBe(2)
  expect(attributeRequests).toBeGreaterThanOrEqual(2)
  render()
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(requests).toBe(2)
  expect(tokenRequests).toBe(2)
  root.unmount()
})
