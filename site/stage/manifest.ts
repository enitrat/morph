import type { ComponentType } from "react"
import { type RawAsk, type RawScene, type RawVariant, scenes as raw } from "virtual:morph-scenes"

import type { SceneInput, VariantMeta } from "./scene"
import { RepoPath, type Stat, type VariantId } from "./wire"

/**
 * A scene's code at one point: the original, or what a variant wrote on top of its parent. Its
 * `asks` are the recorded asks that start from it, so a refine is an ask under a variant.
 */
export interface RevisionNode {
  /** `pricing`, `pricing/compare-three-plans:v2`: unique across the manifest. */
  readonly key: string
  load(): Promise<ComponentType>
  readonly asks: readonly AskNode[]
}

export interface AskNode {
  readonly slug: string
  readonly words: string
  readonly aliases: readonly string[]
  /** The tuple position is the variant id. */
  readonly variants: readonly [VariantNode, VariantNode, VariantNode]
}

export interface VariantNode {
  readonly id: VariantId
  readonly meta: VariantMeta
  readonly files: readonly [RepoPath, ...RepoPath[]]
  readonly stat: Stat
  readonly revision: RevisionNode
}

export interface SceneNode {
  readonly id: string
  readonly title: string
  readonly cell: SceneInput["cell"]
  /** The component name every revision's entry file exports. */
  readonly entry: string
  /** The scene folder, `site/scenes/pricing`. */
  readonly dir: RepoPath
  /** The original's entry, in the first chunk so the page paints without waiting. */
  readonly Entry: ComponentType
  readonly original: RevisionNode
}

function revisionOf(
  key: string,
  load: () => Promise<ComponentType>,
  asks: readonly RawAsk[],
): RevisionNode {
  let loading: Promise<ComponentType> | undefined
  return { key, load: () => (loading ??= load()), asks: asks.map((ask) => askOf(key, ask)) }
}

function askOf(parent: string, ask: RawAsk): AskNode {
  const variant = (from: RawVariant): VariantNode => {
    const [first, ...rest] = from.files.map((path) => RepoPath.parse(path))
    if (first === undefined) throw new Error(`${parent}/${ask.slug}:${from.id} changes no file`)
    return {
      id: from.id,
      meta: from.meta,
      files: [first, ...rest],
      stat: from.stat,
      revision: revisionOf(`${parent}/${ask.slug}:${from.id}`, from.load, from.asks),
    }
  }
  const [v1, v2, v3] = ask.variants
  return {
    slug: ask.slug,
    words: ask.ask.words,
    aliases: ask.ask.aliases ?? [],
    variants: [variant(v1), variant(v2), variant(v3)],
  }
}

const sceneOf = (from: RawScene): SceneNode => ({
  id: from.id,
  title: from.scene.title,
  cell: from.scene.cell,
  entry: from.entry,
  dir: RepoPath.parse(from.dir),
  Entry: from.Entry,
  original: revisionOf(from.id, () => Promise.resolve(from.Entry), from.asks),
})

export interface Manifest {
  readonly scenes: readonly SceneNode[]
  /** The scene whose folder holds `path`, or null for page chrome. */
  sceneAt(path: string): SceneNode | null
}

export function manifestOf(list: readonly RawScene[]): Manifest {
  const scenes = list.map(sceneOf)
  return {
    scenes,
    sceneAt: (path) => scenes.find((scene) => path.startsWith(`${scene.dir}/`)) ?? null,
  }
}

export const manifest = manifestOf(raw)

/**
 * A variant's own file as the repo path it stands for once written:
 * `site/scenes/pricing/asks/compare-three-plans/v1/PricingCard.tsx` is
 * `site/scenes/pricing/PricingCard.tsx`.
 */
export const canonical = (path: string): string =>
  path.replaceAll(/\/asks\/[^/]+\/v[123](?=\/)/g, "")
