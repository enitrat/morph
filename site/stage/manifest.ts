import {
  type RawAsk,
  type RawFile,
  type RawRevision,
  type RawScene,
  type RawVariant,
  scenes as raw,
} from "virtual:morph-scenes"

import type { Body } from "./live"
import type { SceneInput, VariantMeta } from "./scene"
import { RepoPath, type Stat, type VariantId } from "./wire"

/** What an ask restyles: one part of an object, an object's layout, or the whole table. */
export type Level = "part" | "object" | "table"

/**
 * One revision of one repo file: the original, or what a variant wrote over its parent revision.
 * Its `asks` are the recorded asks that start from it, so a refine is an ask under a variant.
 */
export interface Revision {
  /** `pass/Pass.tsx`, `pass/Pass.tsx/departures:v2`: unique across the manifest. */
  readonly key: string
  readonly file: FileNode
  /** The variant that wrote it; null for the original. */
  readonly from: VariantNode | null
  /** Refines: the asks recorded on top of this revision. */
  readonly asks: readonly AskNode[]
  /** The body once loaded; the originals are loaded from the start. */
  body(): Body | undefined
  load(): Promise<Body>
  source(): Promise<string>
}

export interface AskNode {
  readonly slug: string
  readonly words: string
  readonly aliases: readonly string[]
  /** Offered first, and prefilled in the composer. */
  readonly lead: boolean
  /** The revision this ask starts from: every variant rewrites its file. */
  readonly base: Revision
  /** The tuple position is the variant id. */
  readonly variants: readonly [VariantNode, VariantNode, VariantNode]
}

export interface VariantNode {
  readonly id: VariantId
  readonly meta: VariantMeta
  readonly stat: Stat
  readonly ask: AskNode
  readonly revision: Revision
}

export interface FileNode {
  readonly path: RepoPath
  /** The component it exports, `PassRoute`, or the stylesheet's name. */
  readonly name: string
  /** What a visitor calls it, "The total", from its scene's `files`. */
  readonly label: string
  readonly kind: "component" | "style"
  readonly level: Level
  readonly scene: SceneNode
  readonly original: Revision
  /** Lines added and removed going from one revision of the file to another. */
  stat(from: Revision, to: Revision): Stat
}

export interface SceneNode {
  readonly id: string
  readonly title: string
  readonly kind: SceneInput["kind"]
  /** The scene folder, `site/scenes/pass`. */
  readonly dir: RepoPath
  /** Its layout, the component named after the folder. */
  readonly entry: RepoPath
  readonly files: readonly FileNode[]
}

/** The virtual repo: each file's current revision. */
export type Repo = ReadonlyMap<RepoPath, Revision>

export interface Manifest {
  readonly scenes: readonly SceneNode[]
  readonly files: ReadonlyMap<RepoPath, FileNode>
  /** Every file at its original revision. */
  readonly original: Repo
  /** The repo file at `path`, any string the wire carries. */
  fileAt(path: string): FileNode | undefined
  /**
   * The asks a designer who picks code in `file` can make on `repo`. On each file: the refines
   * recorded on its current revision, then the asks recorded on its original, but for the one
   * that wrote the current revision. At a scene's entry, also those of the scene's stylesheets,
   * which have no JSX to pick. A part with none offers its object's.
   */
  offeredAt(file: FileNode, repo: Repo): readonly AskNode[]
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

// The tree points both ways (a revision names its file, a file its original revision), so each node
// is built mutable and its back-pointing field is filled before the node is handed out.

function revisionOf(from: RawRevision, file: FileNode, variant: VariantNode | null): Revision {
  let body = from.body
  let loading: Promise<Body> | undefined
  const revision: Mutable<Revision> = {
    key: from.key,
    file,
    from: variant,
    asks: [],
    body: () => body,
    load: () =>
      (loading ??= (from.load?.() ?? Promise.resolve(from.body as Body)).then((loaded) => {
        body = loaded
        return loaded
      })),
    source: from.source,
  }
  revision.asks = from.asks
    .map((ask) => askOf(ask, revision))
    .sort((a, b) => Number(b.lead) - Number(a.lead))
  return revision
}

function askOf(from: RawAsk, base: Revision): AskNode {
  const ask: Mutable<AskNode> = {
    slug: from.slug,
    words: from.ask.words,
    aliases: from.ask.aliases ?? [],
    lead: from.ask.lead ?? false,
    base,
    variants: undefined as never,
  }
  const variant = (raw: RawVariant): VariantNode => {
    const node: Mutable<VariantNode> = {
      id: raw.id,
      meta: raw.meta,
      stat: raw.stat,
      ask,
      revision: undefined as never,
    }
    node.revision = revisionOf(raw.revision, base.file, node)
    return node
  }
  const [v1, v2, v3] = from.variants
  ask.variants = [variant(v1), variant(v2), variant(v3)]
  return ask
}

function fileOf(from: RawFile, scene: SceneNode, labels: SceneInput["files"]): FileNode {
  const path = RepoPath.parse(from.path)
  const label = labels[from.name]
  if (label === undefined)
    throw new Error(`morph-scenes: ${scene.id}/scene.ts names no label for ${from.name}`)
  const file: Mutable<FileNode> = {
    path,
    name: from.name,
    label,
    kind: from.kind,
    level: scene.kind === "table" ? "table" : path === scene.entry ? "object" : "part",
    scene,
    original: undefined as never,
    stat: (before, after) =>
      before === after
        ? { add: 0, del: 0 }
        : (from.stats[`${before.key}>${after.key}`] ?? { add: 0, del: 0 }),
  }
  file.original = revisionOf(from.original, file, null)
  return file
}

export function manifestOf(list: readonly RawScene[]): Manifest {
  const scenes = list.map((from) => {
    const scene: Mutable<SceneNode> = {
      id: from.id,
      title: from.scene.title,
      kind: from.scene.kind,
      dir: RepoPath.parse(from.dir),
      entry: RepoPath.parse(from.entry),
      files: [],
    }
    scene.files = from.files.map((file) => fileOf(file, scene, from.scene.files))
    return scene
  })
  const files = new Map(scenes.flatMap((scene) => scene.files.map((file) => [file.path, file])))
  return {
    scenes,
    files,
    original: new Map([...files].map(([path, file]) => [path, file.original])),
    fileAt(path) {
      const parsed = RepoPath.safeParse(path)
      return parsed.success ? files.get(parsed.data) : undefined
    },
    offeredAt(file, repo) {
      const at = (node: FileNode) => {
        const current = repo.get(node.path) ?? node.original
        const own = current === node.original ? [] : current.asks
        const house = node.original.asks.filter((ask) => ask !== current.from?.ask)
        return [...own, ...house]
      }
      const entry = file.path === file.scene.entry
      const styles = entry
        ? file.scene.files.filter((node) => node.kind === "style").flatMap(at)
        : []
      const own = [...at(file), ...styles]
      // A part with no asks of its own offers its object's, so every pick has something to ask.
      if (own.length > 0 || entry) return own
      const object = files.get(file.scene.entry)
      return object === undefined ? own : this.offeredAt(object, repo)
    },
  }
}

export const manifest = manifestOf(raw)

/**
 * A variant's own file as the repo path it stands for once written:
 * `site/scenes/pass/asks/departures/v1/Pass.tsx` is `site/scenes/pass/Pass.tsx`.
 */
export const canonical = (path: string): string =>
  path.replaceAll(/\/asks\/[^/]+\/v[123](?=\/)/g, "")
