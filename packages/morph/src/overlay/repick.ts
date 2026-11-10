import { leafAt, meaningfulFrom } from "../inspector/target"
import { catalogNow } from "./catalog"
import { type Spot } from "./model"

/**
 * An element an ask is about, and where its box's middle was when the ask was sent; `null` once a
 * reload lost the element, which is then picked again at its spot.
 */
export interface Picked {
  element: Element | null
  at: Spot
}

/** An element the ask is about, with the middle of its box in document coordinates. */
export function pickedOf(element: Element): Picked {
  const box = element.getBoundingClientRect()
  return {
    element,
    at: {
      x: box.left + box.width / 2 + window.scrollX,
      y: box.top + box.height / 2 + window.scrollY,
    },
  }
}

/**
 * What is picked once a kept variant is the page: each element that is still there, else the
 * meaningful box now at its spot, as the kept code drew it.
 */
export function repicked(picked: readonly Picked[]): Element[] {
  const found = picked.flatMap(({ element, at }) => {
    if (element?.isConnected) return [element]
    const leaf = leafAt(at.x - window.scrollX, at.y - window.scrollY)
    return leaf === null ? [] : [meaningfulFrom(leaf, catalogNow())]
  })
  return [...new Set(found)]
}
