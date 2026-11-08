import { instanceName, isComponentName, rootedAt } from "../inspector/fiber"
import { above, isMeaningful, isTune, leafAt, meaningfulFrom } from "../inspector/target"
import { SHELL } from "../inspector/label"
import { catalogNow, labelNow } from "./catalog"

/**
 * The outermost React component the element is the root of; `null` for a plain element or one
 * only framework plumbing roots, such as Next's `OuterLayoutRouter`.
 */
export function componentOf(element: Element): string | null {
  return (
    rootedAt(element)
      .map(instanceName)
      .filter((name) => isComponentName(name) && !SHELL.test(name))
      .at(-1) ?? null
  )
}

/** A component's name, else the label a designer knows the element by. */
export const nameOf = (element: Element) => componentOf(element) ?? labelNow(element)

/** The meaningful element under a viewport point, as a click selects it. */
export function pickAt(x: number, y: number): Element | null {
  const leaf = leafAt(x, y)
  return leaf && meaningfulFrom(leaf, catalogNow())
}

export const parentOf = (element: Element): Element | null => above(element, catalogNow())

const visible = (element: Element) => {
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

/** The meaningful elements directly inside `element`: the outermost ones under each branch. */
export function childrenOf(element: Element, limit = 64): Element[] {
  const found: Element[] = []
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (found.length >= limit) return
      if (isTune(child) || !visible(child)) continue
      if (isMeaningful(child, catalogNow())) found.push(child)
      else walk(child)
    }
  }
  walk(element)
  return found
}

export const firstChildOf = (element: Element): Element | null => childrenOf(element, 1)[0] ?? null

/** The next meaningful element beside this one, wrapping; `dir` -1 goes back. */
export function siblingOf(element: Element, dir: 1 | -1): Element | null {
  const list = childrenOf(parentOf(element) ?? document.body)
  const at = list.indexOf(element)
  if (at < 0 || list.length < 2) return null
  return list[(at + dir + list.length) % list.length] ?? null
}

/** The meaningful ancestors, outermost first. */
export function pathOf(element: Element): Element[] {
  const path: Element[] = []
  for (let node = parentOf(element); node !== null && path.length < 12; node = parentOf(node))
    path.unshift(node)
  return path
}

export interface Layer {
  element: Element
  name: string
  children: Layer[]
}

/** The page's components as a tree, by DOM nesting. */
export function layersOf(limit = 400): Layer[] {
  const roots: Layer[] = []
  const open: Layer[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  let count = 0
  for (let node = walker.nextNode(); node !== null && count < limit; node = walker.nextNode()) {
    if (!(node instanceof Element) || isTune(node)) continue
    const name = componentOf(node)
    if (name === null || !visible(node)) continue
    count++
    while (open.length > 0 && !open.at(-1)?.element.contains(node)) open.pop()
    const layer: Layer = { element: node, name, children: [] }
    const parent = open.at(-1)
    if (parent === undefined) roots.push(layer)
    else parent.children.push(layer)
    open.push(layer)
  }
  return roots
}
