declare module "virtual:morph-scenes" {
  import type { Body } from "./live"
  import type { AskInput, SceneInput, VariantMeta } from "./scene"

  interface RawRevision {
    key: string
    /** The original's body, bundled with the page so it paints at once; a variant has none. */
    body: Body | undefined
    /** A variant's own chunk; the original has none. */
    load: (() => Promise<Body>) | undefined
    /** The revision's text, for the Keep ledger's diff. */
    source: () => Promise<string>
    asks: RawAsk[]
  }
  interface RawVariant {
    id: "v1" | "v2" | "v3"
    meta: VariantMeta
    /** Lines added and removed against the revision its ask starts from. */
    stat: { add: number; del: number }
    revision: RawRevision
  }
  interface RawAsk {
    slug: string
    ask: AskInput
    variants: [RawVariant, RawVariant, RawVariant]
  }
  interface RawFile {
    /** The file's repo path, `site/scenes/pass/PassRoute.tsx`. */
    path: string
    /** The component it exports, or the stylesheet's name. */
    name: string
    kind: "component" | "style"
    /** Lines added and removed, keyed `<from revision key>><to revision key>`. */
    stats: Record<string, { add: number; del: number }>
    original: RawRevision
  }
  interface RawScene {
    id: string
    scene: SceneInput
    /** The scene folder's repo path. */
    dir: string
    /** The repo path of the component named after the folder. */
    entry: string
    files: RawFile[]
  }

  export const scenes: RawScene[]
}
