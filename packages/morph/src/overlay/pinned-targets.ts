import { z } from "zod"

import { leafAt, meaningfulFrom } from "../inspector/target"
import { catalogNow } from "./catalog"
import { type Spot } from "./model"
import { Spec, specOf } from "./specs"
import { nameOf } from "./tree"

/** A visible snapshot, independent of source-file placement or server round. */
export const ReferenceMeasurement = z.object({
  capture: z.enum(["before-first-ask", "saved"]),
  name: z.string(),
  viewport: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  spec: Spec,
})
/** Measurements saved before the first ask or explicitly by the designer. */
export type ReferenceMeasurement = z.infer<typeof ReferenceMeasurement>

/** Position recovery is a useful locator, not proof of component identity. */
export type TargetMatch = { kind: "selected" | "position"; element: Element } | { kind: "missing" }

/** One stable slot in a thread, retaining its reference when the DOM disappears or is replaced. */
export interface PinnedTarget {
  readonly at: Spot
  readonly reference: ReferenceMeasurement | null
  readonly match: TargetMatch
}

/** Captures each initial ask subject before any asynchronous lookup or server command. */
export function captureTarget(element: Element): PinnedTarget {
  const box = element.getBoundingClientRect()
  return {
    at: { x: box.left + box.width / 2 + scrollX, y: box.top + box.height / 2 + scrollY },
    reference: captureReference(element, "before-first-ask"),
    match: { kind: "selected", element },
  }
}

/** Measures the visible element at the capture moment, without attributing it to a source revision. */
export function captureReference(
  element: Element,
  capture: ReferenceMeasurement["capture"] = "saved",
): ReferenceMeasurement {
  return {
    capture,
    name: nameOf(element),
    viewport: { width: innerWidth, height: innerHeight },
    spec: specOf(element),
  }
}

/** Resolves every target slot without merging, removing, or changing its saved reference. */
export function resolveTargets(targets: readonly PinnedTarget[]): readonly PinnedTarget[] {
  return targets.map((target) => {
    if (target.match.kind !== "missing" && target.match.element.isConnected) return target
    const leaf = leafAt(target.at.x - scrollX, target.at.y - scrollY)
    if (leaf === null)
      return target.match.kind === "missing" ? target : { ...target, match: { kind: "missing" } }
    return { ...target, match: { kind: "position", element: meaningfulFrom(leaf, catalogNow()) } }
  })
}

/** Distinct connected elements for command anchors and layout; the owned target slots stay intact. */
export function targetElements(targets: readonly PinnedTarget[]): Element[] {
  return [
    ...new Set(
      targets.flatMap(({ match }) =>
        match.kind !== "missing" && match.element.isConnected ? [match.element] : [],
      ),
    ),
  ]
}
