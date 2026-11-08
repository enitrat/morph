import { type Component, type TokenGraph, type TokenName } from "./design-system"
import { dependentsOf } from "./graph"

/** Counts components that read the token or a dependent, directly or through a child. */
export function impactOf(
  graph: TokenGraph,
  token: TokenName,
  components: readonly Pick<Component, "reads" | "childReads">[],
): number {
  const touched = [token, ...dependentsOf(graph, [token])]
  return components.filter((component) =>
    touched.some((name) => component.reads.has(name) || component.childReads.has(name)),
  ).length
}
