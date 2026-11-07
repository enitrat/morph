import { type Component, type TokenGraph, type TokenName } from "./design-system"
import { type TokenEdit } from "./edit"
import { dependentsOf } from "./graph"

export type ComponentReads = Pick<
  Component,
  "slug" | "title" | "group" | "href" | "reads" | "childReads"
>

/**
 * `edited`: the component's own sources read an edited token; `reached`: only a token that reads
 * one, or a component it renders.
 */
export type Touch = "edited" | "reached"

interface Reach {
  slug: string
  title: string
  group: string
  href: string | null
  /** The changed tokens this component reads. */
  via: TokenName[]
  touch: Touch
}

export interface Impact {
  /** The edited tokens and every token that reads one of them. */
  touched: TokenName[]
  components: Reach[]
}

/**
 * Which components a set of edits reaches: a component is touched when it, or a component it
 * renders, reads an edited token, a token that reads one, or the Tailwind utility of a touched role.
 */
export function impactOf(
  graph: TokenGraph,
  edits: readonly TokenEdit[],
  components: readonly ComponentReads[],
): Impact {
  const edited = new Set(edits.map((edit) => edit.token))
  const touched = [...new Set([...edited, ...dependentsOf(graph, edited)])]
  const reached = components
    .flatMap((component): Reach[] => {
      const via = touched.filter(
        (token) => component.reads.has(token) || component.childReads.has(token),
      )
      if (via.length === 0) return []
      const { slug, title, group, href, reads } = component
      const touch = via.some((token) => edited.has(token) && reads.has(token))
        ? "edited"
        : "reached"
      return [{ slug, title, group, href, via, touch }]
    })
    .toSorted((a, b) => a.title.localeCompare(b.title))
  return { touched, components: reached }
}
