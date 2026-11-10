/**
 * What a scene author writes. A scene is a folder under `site/scenes/`:
 *
 *   scenes/<id>/scene.ts            defineScene
 *   scenes/<id>/<Entry>.tsx         the original, the folder's only top-level .tsx, exporting <Entry>
 *   scenes/<id>/asks/<slug>/ask.ts  defineAsk
 *   scenes/<id>/asks/<slug>/v1..v3/ what that variant wrote: <Entry>.tsx, any added files, meta.json
 *
 * A refine is an `asks/` folder inside a variant folder. The scenes plugin derives everything else
 * (the revision tree, each variant's files and stat) and fails the build on a missing piece.
 */

export interface SceneInput {
  readonly title: string
  /** The cell's fixed size in px. Every variant must fit it, so a pin re-picks at its spot. */
  readonly cell: { readonly width: number; readonly height: number }
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
