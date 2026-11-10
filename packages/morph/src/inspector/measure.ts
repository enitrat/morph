import { isMorph, leafAt } from "./target"

/** A rectangle in viewport CSS pixels. */
export interface MeasureRect {
  left: number
  top: number
  width: number
  height: number
}

/** Rendered geometry and computed CSS values, kept separate when transforms scale a box. */
export interface MeasuredBox {
  element: Element
  rect: MeasureRect
  padding: readonly [number, number, number, number]
  border: readonly [number, number, number, number]
  radius: readonly [string, string, string, string]
  scale: { x: number; y: number } | null
  gap: string | null
}

/** A measured distance between adjacent children, rather than a claim about CSS gap. */
export interface MeasuredSpace {
  rect: MeasureRect
  distance: number
}

/** One bounded DOM read for a blueprint. */
export interface Measurements {
  boxes: readonly MeasuredBox[]
  spaces: readonly MeasuredSpace[]
}

/** Normalizes a drag in either direction. */
export function measurementFrame(
  from: { x: number; y: number },
  to: { x: number; y: number },
): MeasureRect {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}

const rectOf = (rect: DOMRect): MeasureRect => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
})
const px = (value: string) => Number.parseFloat(value) || 0
const intersects = (a: MeasureRect, b: MeasureRect) =>
  a.left < b.left + b.width &&
  a.left + a.width > b.left &&
  a.top < b.top + b.height &&
  a.top + a.height > b.top

function axisAligned(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.rotate && style.rotate !== "none" && !/^0(?:deg|rad|turn)?$/.test(style.rotate))
      return false
    if (
      style.scale &&
      style.scale !== "none" &&
      style.scale.split(/\s+/).some((value) => Number.parseFloat(value) <= 0)
    )
      return false
    const transform = style.transform
    if (!transform || transform === "none") continue
    const match = /^matrix\(([^)]+)\)$/.exec(transform)
    if (match === null) return false
    const [a, b, c, d] = (match[1] ?? "").split(",").map(Number)
    if (a === undefined || d === undefined || a <= 0 || d <= 0 || b !== 0 || c !== 0) return false
  }
  return true
}

/** Reads a real box; unavailable inner geometry is explicit for rotated or skewed content. */
export function measureBox(element: Element): MeasuredBox | null {
  if (!element.isConnected || isMorph(element)) return null
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (getComputedStyle(node).opacity === "0") return null
  }
  const style = getComputedStyle(element)
  const rect = rectOf(element.getBoundingClientRect())
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.opacity === "0"
  )
    return null
  const padding = [
    px(style.paddingTop),
    px(style.paddingRight),
    px(style.paddingBottom),
    px(style.paddingLeft),
  ] as const
  const border = [
    px(style.borderTopWidth),
    px(style.borderRightWidth),
    px(style.borderBottomWidth),
    px(style.borderLeftWidth),
  ] as const
  const radius = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ] as const
  const scale =
    element instanceof HTMLElement &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0 &&
    axisAligned(element)
      ? { x: rect.width / element.offsetWidth, y: rect.height / element.offsetHeight }
      : null
  const layout = style.display.includes("flex") || style.display.includes("grid")
  const gaps = [style.rowGap, style.columnGap].filter(
    (value) => value && value !== "normal" && value !== "0px",
  )
  const gap = layout && gaps.length > 0 ? [...new Set(gaps)].join(" / ") : null
  return { element, rect, padding, border, radius, scale, gap }
}

function useful(element: Element, measured: MeasuredBox): boolean {
  const style = getComputedStyle(element)
  return (
    measured.padding.some((value) => value > 0) ||
    measured.border.some((value) => value > 0) ||
    measured.gap !== null ||
    (style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.backgroundColor !== "transparent" &&
      style.backgroundColor !== "") ||
    element.matches("img,svg,button,input,select,textarea,video,canvas") ||
    [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
  )
}

function spacesOf(box: MeasuredBox): MeasuredSpace[] {
  if (box.scale === null) return []
  const style = getComputedStyle(box.element)
  if (!style.display.includes("flex") || style.flexWrap !== "nowrap") return []
  const horizontal = style.flexDirection.startsWith("row")
  const children = [...box.element.children]
    .filter((child) => !isMorph(child))
    .slice(0, 24)
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top))
  const result: MeasuredSpace[] = []
  for (let index = 1; index < children.length; index++) {
    const before = children[index - 1]
    const after = children[index]
    if (before === undefined || after === undefined) continue
    const distance = horizontal ? after.left - before.right : after.top - before.bottom
    const crossStart = horizontal
      ? Math.max(before.top, after.top)
      : Math.max(before.left, after.left)
    const crossEnd = horizontal
      ? Math.min(before.bottom, after.bottom)
      : Math.min(before.right, after.right)
    if (distance < 1 || crossEnd <= crossStart) continue
    result.push({
      distance,
      rect: horizontal
        ? { left: before.right, top: crossStart, width: distance, height: crossEnd - crossStart }
        : { left: crossStart, top: before.bottom, width: crossEnd - crossStart, height: distance },
    })
  }
  return result
}

function nearbyElements(frame: MeasureRect): Element[] {
  const found = new Set<Element>()
  const left = Math.max(0, frame.left)
  const top = Math.max(0, frame.top)
  const right = Math.min(window.innerWidth, frame.left + frame.width)
  const bottom = Math.min(window.innerHeight, frame.top + frame.height)
  if (right <= left || bottom <= top) return []
  for (const xPart of [0.1, 0.5, 0.9]) {
    for (const yPart of [0.1, 0.5, 0.9]) {
      const x = left + (right - left) * xPart
      const y = top + (bottom - top) * yPart
      const leaf = leafAt(x, y)
      for (const hit of [...(leaf === null ? [] : [leaf]), ...document.elementsFromPoint(x, y)]) {
        for (
          let node: Element | null = hit;
          node !== null && node !== document.body && node !== document.documentElement;
          node = node.parentElement
        ) {
          if (!isMorph(node)) found.add(node)
        }
      }
    }
  }
  return [...found]
}

/** Measures a bounded meaningful subset of a region, or a selected element and its descendants. */
export function measureRegion(frame: MeasureRect, selected: Element | null = null): Measurements {
  const root = selected ?? document.body
  const filter: NodeFilter = {
    acceptNode(node) {
      if (!(node instanceof Element) || isMorph(node) || node.matches("script,style,link,meta,head"))
        return NodeFilter.FILTER_REJECT
      const style = getComputedStyle(node)
      if (style.display === "none" || style.opacity === "0") return NodeFilter.FILTER_REJECT
      return style.visibility === "hidden" ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT
    },
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter)
  const boxes: MeasuredBox[] = []
  const signatures = new Set<string>()
  let scanned = 0
  const nearby = selected === null ? nearbyElements(frame) : []
  const visited = new Set<Element>()
  const include = (node: Element) => {
    if (visited.has(node) || boxes.length >= 32) return
    visited.add(node)
    const measured = measureBox(node)
    if (
      measured !== null &&
      intersects(frame, measured.rect) &&
      (node === selected || useful(node, measured))
    ) {
      const { left, top, width, height } = measured.rect
      const signature = [left, top, width, height].map(Math.round).join(",")
      if (!signatures.has(signature)) {
        signatures.add(signature)
        boxes.push(measured)
      }
    }
  }
  for (const node of nearby) include(node)
  const roots = selected === null ? [...nearby, root] : [root]
  for (const start of roots) {
    const current =
      start === root ? walker : document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT, filter)
    let node: Node | null = start === selected ? selected : current.nextNode()
    while (node !== null && scanned++ < 1200 && boxes.length < 32) {
      if (node instanceof Element) include(node)
      node = current.nextNode()
    }
    if (scanned >= 1200 || boxes.length >= 32) break
  }
  return { boxes, spaces: boxes.flatMap(spacesOf).slice(0, 32) }
}
