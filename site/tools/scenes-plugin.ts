import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, extname, join, relative, resolve } from "node:path"

import { structuredPatch } from "diff"
import type { Plugin } from "vite"

const ID = "virtual:morph-scenes"
const RESOLVED = `\0${ID}`
const LIVE = "\0morph-live:"
const VARIANTS = ["v1", "v2", "v3"] as const
/** The files of the virtual repo: a scene folder's top-level components and stylesheets. */
const REVISIONED = /\.(tsx|css)$/
/** A variant folder inside an ask, `…/asks/invoice/v2`, which stands for its scene folder. */
const VARIANT_DIR = /\/asks\/[^/]+\/v[123](?=\/|$)/g
/** `import { ReceiptTotal } from "./ReceiptTotal"`, the one way to import a repo file. */
const PART_IMPORT = /import\s+\{\s*(\w+)\s*\}\s+from\s+["'](\.\.?\/[^"']+)["']/g
const ANY_IMPORT = /import\s+(type\s+)?([^;]*?)\s+from\s+["'](\.\.?\/[^"']+)["']/g

export interface ScenesOptions {
  /** The folder that holds one folder per scene. */
  readonly scenes: string
  /** The repo root, which every path the overlay sees is relative to. */
  readonly repo: string
}

export interface ScannedRevision {
  /** `receipt/Receipt.tsx`, `receipt/Receipt.tsx/invoice:v2`: unique across the repo. */
  readonly key: string
  /** The file on disk that holds this revision's text. */
  readonly abs: string
  readonly text: string
  readonly asks: readonly ScannedAsk[]
}

export interface ScannedAsk {
  readonly slug: string
  readonly dir: string
  readonly variants: readonly ScannedVariant[]
}

export interface ScannedVariant {
  readonly id: (typeof VARIANTS)[number]
  readonly dir: string
  readonly stat: { readonly add: number; readonly del: number }
  readonly revision: ScannedRevision
}

export interface ScannedFile {
  /** `site/scenes/receipt/ReceiptTotal.tsx`. */
  readonly path: string
  /** The component it exports, `ReceiptTotal`, or the stylesheet's name. */
  readonly name: string
  readonly kind: "component" | "style"
  readonly original: ScannedRevision
  /**
   * Lines added and removed from every revision of the file to every variant's revision, keyed
   * `<from key>><to key>`: an ask may start from whichever revision the board keeps.
   */
  readonly stats: Readonly<Record<string, { readonly add: number; readonly del: number }>>
}

export interface ScannedScene {
  readonly id: string
  readonly dir: string
  /** `site/scenes/receipt/Receipt.tsx`: the component named after the folder. */
  readonly entry: string
  readonly files: readonly ScannedFile[]
}

const pascal = (id: string) =>
  id.replaceAll(/(?:^|-)([a-z])/g, (_, letter: string) => letter.toUpperCase())

const dirsIn = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isDirectory())
        .sort()
    : []

const revisionedIn = (dir: string) =>
  readdirSync(dir)
    .filter((name) => REVISIONED.test(name))
    .sort()

/** The scene folder a scene or variant file stands for once its variant is written. */
export const canonicalDir = (file: string) => dirname(file).replaceAll(VARIANT_DIR, "")

function statOf(before: string, after: string) {
  let add = 0
  let del = 0
  for (const hunk of structuredPatch("a", "b", before, after).hunks)
    for (const line of hunk.lines) {
      if (line.startsWith("+")) add++
      else if (line.startsWith("-")) del++
    }
  return { add, del }
}

/** The repo files a component's text imports, as `{ Name }` from a relative path. */
function partsOf(text: string, dir: string, files: ReadonlySet<string>): Set<string> {
  const parts = new Set<string>()
  for (const [, , from] of text.matchAll(PART_IMPORT)) {
    const file = fileAt(join(dir, from ?? ""), files)
    if (file !== null) parts.add(file)
  }
  return parts
}

/** The repo file a relative import names, with or without its extension. */
function fileAt(target: string, files: ReadonlySet<string>): string | null {
  for (const candidate of [target, `${target}.tsx`, `${target}.css`])
    if (files.has(candidate)) return candidate
  return null
}

/**
 * Walks the scenes folder into one tree per repo file: its original revision, the asks recorded
 * on it, and each variant's revision with the asks recorded on top of it. `fail` throws.
 */
export function scan(root: string, fail: (message: string) => never): ScannedScene[] {
  const scenes = dirsIn(root)
  const files = new Set(
    scenes.flatMap((id) => revisionedIn(join(root, id)).map((name) => join(root, id, name))),
  )

  const checkImports = (abs: string, text: string) => {
    for (const [statement, type, spec, from] of text.matchAll(ANY_IMPORT)) {
      if (type !== undefined) continue
      const file = fileAt(join(canonicalDir(abs), from ?? ""), files)
      if (file === null) continue
      const named = /^\{\s*(\w+)\s*\}$/.exec(spec ?? "")?.[1]
      if (named !== basename(file, extname(file)))
        fail(
          `${abs}: import ${basename(file)} as \`import { ${basename(file, extname(file))} } from "${from}"\`, not \`${statement}\``,
        )
    }
  }

  const revisionOf = (key: string, abs: string, file: string): ScannedRevision => {
    const text = readFileSync(abs, "utf8")
    const name = basename(file, extname(file))
    if (file.endsWith(".tsx")) {
      if (!new RegExp(`export function ${name}\\b`).test(text))
        fail(`${abs} does not export function ${name}`)
      checkImports(abs, text)
    }
    return { key, abs, text, asks: asksOf(key, dirname(abs), file, text) }
  }

  function asksOf(parent: string, dir: string, file: string, text: string): ScannedAsk[] {
    const name = basename(file)
    const parts = file.endsWith(".tsx") ? partsOf(text, dirname(file), files) : new Set<string>()
    return dirsIn(join(dir, "asks")).flatMap((slug) => {
      const askDir = join(dir, "asks", slug)
      const written = existsSync(join(askDir, "v1")) ? revisionedIn(join(askDir, "v1")) : []
      if (!written.includes(name)) {
        // A scene folder's asks split between its files; a refine rewrites its parent's file.
        if (dir !== dirname(file)) fail(`${askDir} refines ${name}, so its v1 must hold ${name}`)
        return []
      }
      if (!existsSync(join(askDir, "ask.ts"))) fail(`${askDir} has no ask.ts`)
      const variants = VARIANTS.map((id): ScannedVariant => {
        const at = join(askDir, id)
        if (!existsSync(at)) fail(`${askDir} has no ${id}/`)
        const own = revisionedIn(at)
        if (own.length !== 1 || own[0] !== name)
          fail(
            `${at} must hold exactly ${name}, the file its ask rewrites; it holds ${own.join(", ") || "nothing"}`,
          )
        if (!existsSync(join(at, "meta.json"))) fail(`${at} has no meta.json`)
        const revision = revisionOf(`${parent}/${slug}:${id}`, join(at, name), file)
        if (revision.text === text) fail(`${at}/${name} changes nothing`)
        const kept = partsOf(revision.text, dirname(file), files)
        for (const part of parts)
          if (!kept.has(part))
            fail(`${at}/${name} drops ${basename(part)}, which its parent renders`)
        return { id, dir: at, stat: statOf(text, revision.text), revision }
      })
      return [{ slug, dir: askDir, variants }]
    })
  }

  return scenes.map((id): ScannedScene => {
    const dir = join(root, id)
    if (!existsSync(join(dir, "scene.ts"))) fail(`${dir} has no scene.ts`)
    const entry = join(dir, `${pascal(id)}.tsx`)
    if (!files.has(entry)) fail(`${dir} has no ${pascal(id)}.tsx, the component named after it`)
    const scanned = revisionedIn(dir).map((name): ScannedFile => {
      const abs = join(dir, name)
      const original = revisionOf(`${id}/${name}`, abs, abs)
      const all: ScannedRevision[] = []
      const walk = (revision: ScannedRevision) => {
        all.push(revision)
        for (const ask of revision.asks) for (const variant of ask.variants) walk(variant.revision)
      }
      walk(original)
      const stats: Record<string, { add: number; del: number }> = {}
      for (const from of all)
        for (const to of all.slice(1))
          if (from !== to) stats[`${from.key}>${to.key}`] = statOf(from.text, to.text)
      return {
        path: abs,
        name: basename(name, extname(name)),
        kind: name.endsWith(".css") ? "style" : "component",
        original,
        stats,
      }
    })
    const claimed = new Set(scanned.flatMap((file) => file.original.asks.map((ask) => ask.slug)))
    for (const slug of dirsIn(join(dir, "asks")))
      if (!claimed.has(slug)) fail(`${join(dir, "asks", slug)}/v1 rewrites none of ${id}'s files`)
    return { id, dir, entry, files: scanned }
  })
}

/** Every folder whose relative imports resolve as if it were its scene folder, for tsc's rootDirs. */
export function rootDirsOf(scenes: readonly ScannedScene[]): string[] {
  const dirs: string[] = []
  const walk = (revision: ScannedRevision) => {
    for (const ask of revision.asks)
      for (const variant of ask.variants) {
        dirs.push(variant.dir)
        walk(variant.revision)
      }
  }
  for (const scene of scenes) {
    dirs.push(scene.dir)
    for (const file of scene.files) walk(file.original)
  }
  return [...new Set(dirs)]
}

/**
 * `virtual:morph-scenes`: the scenes folder as a virtual repo, one revision tree per file, with each
 * variant's line stat computed here and its code split into its own lazy chunk.
 *
 * A relative import of a repo file, `import { ReceiptTotal } from "./ReceiptTotal"`, resolves to a
 * live binding that renders whichever revision of that file the board shows, so a kept part renders
 * inside every layout. A variant file's other relative imports resolve from its scene folder. The
 * build fails on any piece of the convention that is missing (see `scenes/README.md`).
 */
export function scenes({ scenes: root, repo }: ScenesOptions): Plugin {
  const repoPath = (abs: string) => relative(repo, abs)
  const live = fileURLToStage("live.tsx")
  let scanned: ScannedScene[] | null = null
  let fileSet = new Set<string>()
  const read = (fail: (message: string) => never) => {
    scanned ??= scan(root, fail)
    fileSet = new Set(scanned.flatMap((scene) => scene.files.map((file) => file.path)))
    return scanned
  }
  const ours = (importer: string) =>
    importer.startsWith(`${root}/`) || importer.startsWith(`${resolve(root, "../src")}/`)

  return {
    name: "morph-scenes",
    enforce: "pre",
    buildStart() {
      scanned = null
    },
    watchChange(id) {
      if (id.startsWith(`${root}/`)) scanned = null
    },
    resolveId(source, importer) {
      if (source === ID) return RESOLVED
      if (importer === undefined || importer.startsWith("\0") || !ours(importer)) return undefined
      if (!source.startsWith("./") && !source.startsWith("../")) return undefined
      read((message) => this.error(`morph-scenes: ${message}`))
      const target = join(canonicalDir(importer), source)
      const file = fileAt(target, fileSet)
      if (file !== null && file.endsWith(".tsx")) return `${LIVE}${repoPath(file)}`
      if (canonicalDir(importer) === dirname(importer)) return undefined
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`])
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
      return undefined
    },
    load(id) {
      if (id.startsWith(LIVE)) {
        const path = id.slice(LIVE.length)
        const name = basename(path, extname(path))
        return `import { live } from ${JSON.stringify(live)}\nexport const ${name} = live(${JSON.stringify(path)}, ${JSON.stringify(name)})\n`
      }
      if (id !== RESOLVED) return undefined
      const list = read((message) => this.error(`morph-scenes: ${message}`))
      const imports: string[] = []
      const bind = (spec: string, from: string) => {
        const name = `m${imports.length}`
        imports.push(`import ${spec.replace("$", name)} from ${JSON.stringify(from)}`)
        return name
      }

      const bodyOf = (file: ScannedFile, abs: string, eager: boolean) => {
        const style = file.kind === "style"
        if (eager)
          return style
            ? `{ kind: "style", css: ${bind("$", `${abs}?raw`)} }`
            : `{ kind: "component", Component: ${bind(`{ ${file.name} as $ }`, abs)} }`
        return style
          ? `() => import(${JSON.stringify(`${abs}?raw`)}).then((m) => ({ kind: "style", css: m.default }))`
          : `() => import(${JSON.stringify(abs)}).then((m) => ({ kind: "component", Component: m.${file.name} }))`
      }

      const revisionCode = (
        file: ScannedFile,
        revision: ScannedRevision,
        eager: boolean,
      ): string => {
        this.addWatchFile(revision.abs)
        const body = bodyOf(file, revision.abs, eager)
        const asks = revision.asks.map(
          (ask) =>
            `{ slug: ${JSON.stringify(ask.slug)}, ask: ${bind("$", join(ask.dir, "ask.ts"))}, variants: [${ask.variants
              .map(
                (variant) =>
                  `{ id: "${variant.id}", meta: ${bind("$", join(variant.dir, "meta.json"))}, stat: ${JSON.stringify(variant.stat)}, revision: ${revisionCode(file, variant.revision, false)} }`,
              )
              .join(", ")}] }`,
        )
        const raw = JSON.stringify(`${revision.abs}?raw`)
        // An original stylesheet's text is its body, already in the page's chunk.
        const source =
          eager && file.kind === "style"
            ? `() => Promise.resolve(${body}.css)`
            : `() => import(${raw}).then((m) => m.default)`
        return `{ key: ${JSON.stringify(revision.key)}, ${eager ? `body: ${body}, load: undefined` : `body: undefined, load: ${body}`}, source: ${source}, asks: [${asks.join(", ")}] }`
      }

      const code = list.map((scene) => {
        const files = scene.files.map(
          (file) =>
            `{ path: ${JSON.stringify(repoPath(file.path))}, name: ${JSON.stringify(file.name)}, kind: "${file.kind}", stats: ${JSON.stringify(file.stats)}, original: ${revisionCode(file, file.original, true)} }`,
        )
        return `{ id: ${JSON.stringify(scene.id)}, scene: ${bind("$", join(scene.dir, "scene.ts"))}, dir: ${JSON.stringify(repoPath(scene.dir))}, entry: ${JSON.stringify(repoPath(scene.entry))}, files: [${files.join(", ")}] }`
      })
      return `${imports.join("\n")}\nexport const scenes = [${code.join(", ")}]\n`
    },
  }
}

function fileURLToStage(name: string) {
  return resolve(import.meta.dirname, "../stage", name)
}
