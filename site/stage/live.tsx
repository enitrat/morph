import { type ComponentType, createContext, use } from "react"

/** What one revision of a repo file puts on the page. */
export type Body =
  | { readonly kind: "component"; readonly Component: ComponentType<object> }
  | { readonly kind: "style"; readonly css: string }

/** Each repo file's body as one board draws it: the live board, or a version's thumbnail. */
export type Drawn = ReadonlyMap<string, Body>

export const DrawnRepo = createContext<Drawn | null>(null)

/**
 * The binding a relative import of a repo file resolves to (see the scenes plugin): it renders the
 * revision of `path` that the nearest board draws, so a layout renders whichever part is kept.
 */
export function live(path: string, name: string): ComponentType<object> {
  function Live(props: object) {
    const body = use(DrawnRepo)?.get(path)
    if (body?.kind !== "component") throw new Error(`${path} is not drawn on this board`)
    return <body.Component {...props} />
  }
  // The overlay names a pick after the components rooted at it; this one is the file it stands for.
  Object.defineProperty(Live, "name", { value: name })
  return Live
}
