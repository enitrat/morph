import { type RefObject, useEffect, useLayoutEffect, useReducer, useState } from "react"

import { type SourceLoc } from "../../variant/model"
import { locate } from "../source"

const rectKey = (element: Element | null) => {
  if (element === null || !element.isConnected) return "-"
  const r = element.getBoundingClientRect()
  return `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`
}

/**
 * Re-renders whenever the page scrolls, resizes, or one of `watch` moves, checked once a frame, so
 * page-anchored surfaces follow layout without a render on frames where nothing moved.
 */
export function useTick(watch: readonly (Element | null)[]): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let last = ""
    let raf = 0
    const check = () => {
      const now = [scrollX | 0, scrollY | 0, innerWidth, innerHeight, ...watch.map(rectKey)].join(
        "|",
      )
      if (now !== last) {
        if (last !== "") bump()
        last = now
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => {
      cancelAnimationFrame(raf)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the list is compared by its members.
  }, watch)
}

/** `value`, once it has held still for `ms`; a reset to `null` waits as long. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [value, ms])
  return settled
}

/** Where the element's JSX is, once the bridge answers. */
export function useSource(element: Element | null): SourceLoc | null {
  const [found, setFound] = useState<{ element: Element; at: SourceLoc | null } | null>(null)
  useEffect(() => {
    if (element === null) return undefined
    let live = true
    void locate(element).then((located) => {
      if (live) setFound({ element, at: located.site ?? located.anchor?.source ?? null })
    })
    return () => {
      live = false
    }
  }, [element])
  return found?.element === element ? found.at : null
}

/** `hero.tsx:21` from `app/(marketing)/hero.tsx:21`. */
export const fileOf = (at: SourceLoc) => `${at.path.split("/").at(-1) ?? at.path}:${at.line}`

/** The rendered size of `ref`, read after each render. */
export function useSize(
  ref: RefObject<HTMLElement | null>,
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const { offsetWidth: width, offsetHeight: height } = element
    if (size?.width !== width || size.height !== height) setSize({ width, height })
  })
  return size
}
