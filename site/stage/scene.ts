/**
 * What a scene author writes. The folder convention, the part props contract and the table-style
 * hooks are in `scenes/README.md`.
 */

export interface SceneInput {
  readonly title: string
  /**
   * `object`: a thing on the board, whose entry is its layout and whose other components are its
   * parts. `table`: the board itself, whose stylesheets art-direct every object at once.
   */
  readonly kind: "object" | "table"
}

export const defineScene = (scene: SceneInput): SceneInput => scene

export interface AskInput {
  /** The chip text, and the words a visitor most likely types. */
  readonly words: string
  /** Other phrasings the free-text match accepts. */
  readonly aliases?: readonly string[]
}

export const defineAsk = (ask: AskInput): AskInput => ask

/** `v<n>/meta.json`: what the variant's job reported. */
export interface VariantMeta {
  readonly direction: { readonly title: string; readonly description: string }
  readonly title: string
  readonly summary: string
  /** How long the job took at real speed; the replay divides it by its speed. */
  readonly ms: { readonly agent: number; readonly checks: number; readonly total: number }
}
