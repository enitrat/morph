import { type Fiber, fiberOf, isComponentName, nameOf } from "../inspector/fiber"
import { type Anchor, type SourceLoc } from "../variant/model"
import { bridge } from "./bridge"
import { plumbingAt } from "./catalog"

/** `at Name (http://host/chunk.js:1:2)` or `at http://host/chunk.js:1:2`. */
const FRAME = /^\s*at (?:.*? \()?(https?:\/\/[^)\s]+?:\d+:\d+)\)?$/
const CHAIN_MAX = 8
const FRAMES_PER_LINK = 4

/** Where an element's code is. */
export interface Located {
  /** `null` when no frame of its owner chain maps to a repo file. */
  anchor: Anchor | null
  /** The element's own JSX tag, where its `className` is written; `null` outside the repo. */
  site: SourceLoc | null
}

interface Link {
  name: string | undefined
  frames: string[]
}

function framesOf(fiber: Fiber): string[] {
  // oxlint-disable-next-line no-underscore-dangle -- React's dev-only field, read as React names it.
  const lines = fiber._debugStack?.stack?.split("\n").slice(1) ?? []
  return lines
    .flatMap((line) => {
      const frame = FRAME.exec(line)?.[1]
      return frame?.startsWith(location.origin) ? [frame] : []
    })
    .slice(0, FRAMES_PER_LINK)
}

/** The element's fiber, then each owner that created it: their names and creation frames. */
function chainOf(element: Element): Link[] {
  const chain: Link[] = []
  for (let fiber = fiberOf(element) ?? null; fiber && chain.length < CHAIN_MAX;) {
    const name = nameOf(fiber.type)
    chain.push({ name: isComponentName(name) ? name : undefined, frames: framesOf(fiber) })
    // oxlint-disable-next-line no-underscore-dangle -- see above.
    fiber = fiber._debugOwner ?? null
  }
  return chain
}

async function resolve(element: Element): Promise<Located> {
  const chain = chainOf(element)
  const names = [...new Set(chain.flatMap((link) => link.name ?? []))]
  const frames = chain.flatMap((link) => link.frames)
  if (frames.length === 0) return { anchor: null, site: null }
  const located = await bridge.locate(frames)
  if (!located.ok) return { anchor: null, site: null }
  let next = 0
  const linked = chain.map((link) => {
    const sources = located.value.sources.slice(next, next + link.frames.length)
    next += link.frames.length
    return sources.find((source): source is SourceLoc => source !== null) ?? null
  })
  const sites = linked.filter((site): site is SourceLoc => site !== null)
  const own = linked[0] ?? null
  const plumbing = await Promise.all(sites.map((site) => plumbingAt(site.path)))
  const source = sites.find((_, at) => !plumbing[at]) ?? sites[0]
  if (source === undefined) return { anchor: null, site: own }
  const text = element.textContent.replaceAll(/\s+/g, " ").trim().slice(0, 120)
  return { anchor: { source, owner: names, text }, site: own }
}

/** The bridge locates at most 64 frames per call. */
const FIBERS_PER_CALL = 64 / FRAMES_PER_LINK

/** Where each fiber's element was written: its JSX call site, or `null` outside the repo. */
export async function sitesOf(fibers: readonly Fiber[]): Promise<(SourceLoc | null)[]> {
  const groups: Fiber[][] = []
  for (let at = 0; at < fibers.length; at += FIBERS_PER_CALL)
    groups.push(fibers.slice(at, at + FIBERS_PER_CALL))
  const found = await Promise.all(
    groups.map(async (group) => {
      const frames = group.map(framesOf)
      const flat = frames.flat()
      const located = flat.length === 0 ? null : await bridge.locate(flat)
      let next = 0
      return frames.map((own) => {
        const sources = located?.ok ? located.value.sources.slice(next, next + own.length) : []
        next += own.length
        return sources.find((source): source is SourceLoc => source !== null) ?? null
      })
    }),
  )
  return found.flat()
}

const cache = new WeakMap<Element, Promise<Located>>()

/** Where an element's JSX lives, resolved once per element. */
export function locate(element: Element): Promise<Located> {
  let found = cache.get(element)
  if (found === undefined) {
    found = resolve(element)
    cache.set(element, found)
  }
  return found
}

const keys = new WeakMap<Element, number>()
let lastKey = 0

/** A stable React key for an element. */
export function keyOf(element: Element): number {
  let key = keys.get(element)
  if (key === undefined) {
    key = ++lastKey
    keys.set(element, key)
  }
  return key
}
