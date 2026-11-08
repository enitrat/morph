// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:3000/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type Attribute } from "../dial/jsx"
import { type PropControl } from "../dial/props"
import { type Fiber } from "../inspector/fiber"
import { SourceLoc } from "../variant/model"
import { connect } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { invalidateSources } from "./source"
import { deriveProps } from "./props"

const CONTROLS: PropControl[] = [
  { kind: "enum", name: "variant", options: ["primary", "ghost"], default: "primary" },
  { kind: "boolean", name: "loading", default: false },
]

/** Each JSX site in the fake source: a frame line in the chunk and the tag written there. */
const SITES: Record<number, { site: SourceLoc; tag: string; attributes: Attribute[] }> = {
  10: {
    site: SourceLoc.parse({ path: "apps/site/list.tsx", line: 10, col: 9 }),
    tag: "Button",
    attributes: [{ kind: "attribute", name: "loading", value: { kind: "literal", value: true } }],
  },
  20: {
    site: SourceLoc.parse({ path: "apps/site/row.tsx", line: 20, col: 9 }),
    tag: "Button",
    attributes: [{ kind: "attribute", name: "variant", value: { kind: "code" } }],
  },
  30: {
    site: SourceLoc.parse({ path: "apps/site/wrapper.tsx", line: 30, col: 9 }),
    tag: "Button",
    attributes: [{ kind: "attribute", name: "variant", value: { kind: "forward" } }],
  },
  40: {
    site: SourceLoc.parse({ path: "apps/site/page.tsx", line: 40, col: 9 }),
    tag: "Wrapper",
    attributes: [],
  },
}

const frameAt = (line: number) => `http://localhost:3000/chunk.js:${line}:1`
const stackAt = (line: number) =>
  Object.assign(new Error(), { stack: `Error\n    at X (${frameAt(line)})` })

function Button() {}
function Wrapper() {}
function Page() {}

function component(
  type: unknown,
  props: Record<string, unknown>,
  line: number,
  owner: Fiber | null = null,
): Fiber {
  return {
    type,
    return: null,
    child: null,
    memoizedProps: props,
    stateNode: null,
    _debugOwner: owner,
    _debugStack: stackAt(line),
  }
}

/** A `<button>` on the page rendered by `instance`. */
function rendered(instance: Fiber): Element {
  const element = document.createElement("button")
  const host: Fiber = { ...component("button", {}, 0), return: instance, stateNode: element }
  Object.assign(element, { __reactFiber$test: host })
  document.body.append(element)
  return element
}

const USES: Record<string, { uses: number; examples: number }> = {
  Page: { uses: 1, examples: 0 },
  Wrapper: { uses: 4, examples: 1 },
}

let countFails = false

beforeEach(() => {
  document.body.replaceChildren()
  countFails = false
  connect("/__tune")
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const request = new URL(url, location.origin)
    if (request.pathname.endsWith("/tokens"))
      return Response.json({
        files: [],
        themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
        plumbing: [],
        components: [
          {
            slug: "button",
            title: "Button",
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
    if (request.pathname.endsWith("/plumbing")) return Response.json({ plumbing: [] })
    if (request.pathname.endsWith("/props")) return Response.json({ controls: CONTROLS })
    if (request.pathname.endsWith("/uses")) {
      if (countFails) return new Response("build failed", { status: 500 })
      return Response.json(
        USES[request.searchParams.get("component") ?? ""] ?? { uses: 0, examples: 0 },
      )
    }
    if (request.pathname.endsWith("/locate")) {
      const body: { frames: string[] } = JSON.parse(String(init.body))
      return Response.json({
        sources: body.frames.map(
          (frame) => SITES[Number(/:(\d+):1$/.exec(frame)?.[1])]?.site ?? null,
        ),
      })
    }
    if (request.pathname.endsWith("/attributes")) {
      const found = SITES[Number(request.searchParams.get("line"))]
      return Response.json({
        tag: found ? { name: found.tag, attributes: found.attributes } : null,
      })
    }
    throw new Error(`unexpected request ${url}`)
  })
})

afterEach(() => {
  invalidateCatalog()
  invalidateSources()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe("the props of a picked instance", () => {
  it("writes at the call site and counts the instances it renders", async () => {
    const picked = rendered(component(Button, { loading: true }, 10))
    rendered(component(Button, { loading: true }, 10))
    rendered(component(Button, { loading: true }, 10))
    rendered(component(Button, { variant: "ghost" }, 20))

    const props = await deriveProps(picked)

    expect(props).toEqual({
      component: "Button",
      rows: [
        {
          control: CONTROLS[0],
          value: "primary",
          at: { site: SITES[10]?.site, tag: "Button", written: null, places: 3, wrapper: null },
        },
        {
          control: CONTROLS[1],
          value: true,
          at: { site: SITES[10]?.site, tag: "Button", written: true, places: 3, wrapper: null },
        },
      ],
    })
  })

  it("leaves a prop the code computes read-only", async () => {
    const picked = rendered(component(Button, { variant: "ghost" }, 20))

    const props = await deriveProps(picked)

    expect(props).toMatchObject({ rows: [{ value: "ghost", at: null }, { at: { places: 1 } }] })
  })

  it("follows a forwarded prop up to the page's call site, which reaches only the page", async () => {
    const page = component(Page, {}, 0)
    const wrapper = component(Wrapper, {}, 40, page)
    const picked = rendered(component(Button, { variant: undefined }, 30, wrapper))

    const props = await deriveProps(picked)

    expect(props).toMatchObject({
      rows: [
        { at: { site: SITES[40]?.site, tag: "Wrapper", written: null, places: 1, wrapper: null } },
        { at: { site: SITES[30]?.site, tag: "Button", written: null } },
      ],
    })
  })

  it("reaches every use of the wrapper whose body holds the call site", async () => {
    const page = component(Page, {}, 0)
    const wrapper = component(Wrapper, {}, 40, page)
    const picked = rendered(component(Button, { variant: undefined }, 30, wrapper))

    const props = await deriveProps(picked)

    expect(props).toMatchObject({
      rows: [
        { at: { site: SITES[40]?.site } },
        {
          at: {
            site: SITES[30]?.site,
            places: 1,
            wrapper: { name: "Wrapper", uses: 4, examples: 1 },
          },
        },
      ],
    })
  })

  it("explains a failed count instead of offering a write of unknown reach", async () => {
    countFails = true
    const wrapper = component(Wrapper, {}, 40, component(Page, {}, 0))
    const picked = rendered(component(Button, { variant: undefined }, 30, wrapper))

    expect(typeof (await deriveProps(picked))).toBe("string")
  })

  it("stops when the wrapper holds another value than it passes on", async () => {
    const wrapper = component(Wrapper, { variant: "ghost" }, 40)
    const picked = rendered(component(Button, { variant: "primary" }, 30, wrapper))

    const props = await deriveProps(picked)

    expect(props).toMatchObject({ rows: [{ at: null }, { at: { tag: "Button" } }] })
  })
})
