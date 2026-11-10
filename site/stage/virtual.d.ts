declare module "virtual:morph-scenes" {
  import type { ComponentType } from "react"

  import type { AskInput, SceneInput, VariantMeta } from "./scene"

  interface RawVariant {
    id: "v1" | "v2" | "v3"
    meta: VariantMeta
    /** Repo paths the variant changed against its parent revision; never empty. */
    files: string[]
    stat: { add: number; del: number }
    load: () => Promise<ComponentType>
    asks: RawAsk[]
  }
  interface RawAsk {
    slug: string
    ask: AskInput
    variants: [RawVariant, RawVariant, RawVariant]
  }
  interface RawScene {
    id: string
    scene: SceneInput
    /** The scene folder's repo path. */
    dir: string
    entry: string
    Entry: ComponentType
    asks: RawAsk[]
  }

  export const scenes: RawScene[]
}
