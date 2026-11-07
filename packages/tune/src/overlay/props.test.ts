// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:3000/"}
import { beforeEach, describe, expect, it, vi } from "vitest"

import { type Attribute } from "../dial/jsx"
import { type PropControl } from "../dial/props"
import { type Fiber } from "../inspector/fiber"
import { type SourceLoc } from "../variant/model"
import { bridge } from "./bridge"
import { deriveProps } from "./props"

vi.mock("./catalog", async () => {
  const { CONFIG } = await import("../bridge/test-fixtures")
  const { isPlumbing } = await import("../core")
  return {
    loadTokens: async () => ({ ok: true }),
    catalogNow: () =>
      new Map([["Button", { title: "Button", naming: "own", exports: ["Button"] }]]),
    plumbingAt: async (path: string) => isPlumbing(CONFIG.plumbing, path),
  }
})

vi.mock("./bridge", () => ({
  bridge: { props: vi.fn(), locate: vi.fn(), attributes: vi.fn(), uses: vi.fn() },
  explain: String,
}))

const CONTROLS: PropControl[] = [
  { kind: "enum", name: "variant", options: ["primary", "ghost"], default: "primary" },
  { kind: "boolean", name: "loading", default: false },
]

/** Each JSX site in the fake source: a frame line in the chunk and the tag written there. */
const SITES: Record<number, { site: SourceLoc; tag: string; attributes: Attribute[] }> = {
  10: {
    site: { path: "apps/site/list.tsx", line: 10, col: 9 } as SourceLoc,
    tag: "Button",
    attributes: [{ kind: "attribute", name: "loading", value: { kind: "literal", value: true } }],
  },
  20: {
    site: { path: "apps/site/row.tsx", line: 20, col: 9 } as SourceLoc,
    tag: "Button",
    attributes: [{ kind: "attribute", name: "variant", value: { kind: "code" } }],
  },
  30: {
    site: { path: "apps/site/wrapper.tsx", line: 30, col: 9 } as SourceLoc,
    tag: "Button",
    attributes: [{ kind: "attribute", name: "variant", value: { kind: "forward" } }],
  },
  40: {
    site: { path: "apps/site/page.tsx", line: 40, col: 9 } as SourceLoc,
    tag: "Wrapper",
    attributes: [],
  },
}

const frameAt = (line: number) => `http://localhost:3000/chunk.js:${line}:1`
const stackAt = (line: number) => ({ stack: `Error\n    at X (${frameAt(line)})` }) as Error

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

beforeEach(() => {
  document.body.replaceChildren()
  vi.mocked(bridge.uses).mockImplementation(async (name) => ({
    ok: true,
    value: USES[name] ?? { uses: 0, examples: 0 },
  }))
  vi.mocked(bridge.props).mockResolvedValue({ ok: true, value: { controls: CONTROLS } })
  vi.mocked(bridge.locate).mockImplementation(async (frames) => ({
    ok: true,
    value: {
      sources: frames.map((frame) => SITES[Number(/:(\d+):1$/.exec(frame)?.[1])]?.site ?? null),
    },
  }))
  vi.mocked(bridge.attributes).mockImplementation(async (site) => {
    const found = Object.values(SITES).find((entry) => entry.site === site)
    return {
      ok: true,
      value: { tag: found ? { name: found.tag, attributes: found.attributes } : null },
    }
  })
})

describe("the props of a picked instance", () => {
  it("writes at the call site and counts the instances it renders", async () => {
    const [picked] = [1, 2, 3].map(() => rendered(component(Button, { loading: true }, 10)))
    rendered(component(Button, { variant: "ghost" }, 20))

    const props = await deriveProps(picked as Element)

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
    expect(bridge.uses).toHaveBeenCalledWith("Wrapper", SITES[30]?.site.path)
  })

  it("explains a failed count instead of offering a write of unknown reach", async () => {
    vi.mocked(bridge.uses).mockResolvedValue({ ok: false, error: { kind: "unbuilt" } })
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
