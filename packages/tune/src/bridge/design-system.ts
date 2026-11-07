// oxlint-disable-next-line import/no-nodejs-modules -- the shell globs and reads the repo's files.
import { globSync, readdirSync, readFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join, matchesGlob, posix } from "node:path"

import {
  buildTokens,
  type Component,
  type DesignSystem,
  type PropSource,
  themeModelOf,
  type TokenFile,
  type TokenName,
  tokensReadIn,
} from "../core"
import { type ComponentSource, type TuneConfig } from "../core/config"

/** Every file the config's globs match, path to text. */
export type Snapshot = ReadonlyMap<string, string>

/** A lab-meta folder's own sources: its components and their tokens, tests apart. */
const isFolderSource = (name: string) =>
  (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) || name.endsWith(".tokens.css")

function snapshot(root: string, config: TuneConfig, tokenFiles: readonly string[]): Snapshot {
  const glob = (pattern: string) => globSync(pattern, { cwd: root })
  const paths = tokenFiles.flatMap(glob)
  for (const source of config.components) {
    if (source.kind === "files") paths.push(...glob(source.files))
    else
      for (const meta of glob(source.meta)) {
        const dir = posix.dirname(meta)
        const own = readdirSync(join(root, dir)).filter(isFolderSource)
        paths.push(meta, ...own.map((name) => `${dir}/${name}`))
      }
  }
  return new Map(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]))
}

export function snapshotOf(root: string, config: TuneConfig): Snapshot {
  return snapshot(root, config, config.tokens.files)
}

const byPath = ([a]: [string, string], [b]: [string, string]) => (a < b ? -1 : a > b ? 1 : 0)

/** The snapshot's files a glob matches, sorted by path, as `globSync(...).toSorted()` lists them. */
const matching = (files: Snapshot, pattern: string) =>
  [...files].filter(([path]) => matchesGlob(path, pattern)).toSorted(byPath)

const EXPORT = /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm
const EXPORT_LIST = /^export\s+\{([^}]*)\}/gm
const IMPORT = /^import\s+\{([^}]*)\}\s+from\s+["']([^"']*)["']/gm

/** The React names a source exports: `export function Button`, or `export { Button }`. */
const exportedNames = (text: string): string[] => [
  ...[...text.matchAll(EXPORT)].map(([, name = ""]) => name),
  ...[...text.matchAll(EXPORT_LIST)].flatMap(([, list = ""]) =>
    list
      .split(",")
      .map(
        (specifier) =>
          specifier
            .trim()
            .split(/\s+as\s+/)
            .at(-1) ?? "",
      )
      .filter((name) => /^[A-Z]\w*$/.test(name)),
  ),
]

/** The value names a source imports from one of `specifiers` or a relative path. */
function importedNames(text: string, specifiers: ReadonlySet<string>): string[] {
  return [...text.matchAll(IMPORT)].flatMap(([, list = "", from = ""]) =>
    specifiers.has(from) || from.startsWith(".")
      ? list
          .split(",")
          .map((specifier) => specifier.trim())
          .filter((specifier) => specifier !== "" && !specifier.startsWith("type "))
          .map((specifier) => specifier.split(/\s+as\s+/)[0] ?? specifier)
      : [],
  )
}

interface Listed {
  slug: string
  /** Path and text of each of its sources. */
  files: [string, string][]
  source: ComponentSource
  props: PropSource
}

function listedIn(files: Snapshot, source: ComponentSource): Listed[] {
  if (source.kind === "files")
    return matching(files, source.files).map(([file, text]) => ({
      slug: posix.basename(file).replace(/\.[^.]+$/, ""),
      files: [[file, text]],
      source,
      props: source.props === "cva" ? { kind: "cva", file } : { kind: "none" },
    }))
  return matching(files, source.meta).map(([meta]) => {
    const dir = posix.dirname(meta)
    const slug = posix.basename(dir)
    const own = [...files]
      .filter(([path]) => posix.dirname(path) === dir && isFolderSource(posix.basename(path)))
      .toSorted(byPath)
    const props: PropSource =
      source.props === "lab-meta"
        ? { kind: "lab-meta", meta }
        : source.props === "cva"
          ? { kind: "cva", file: `${dir}/${slug}.tsx` }
          : { kind: "none" }
    return { slug, files: own, source, props }
  })
}

/**
 * Each component with the React names it exports, the tokens it reads, and the tokens read by
 * every listed component it renders, transitively.
 */
function componentsOf(config: TuneConfig, files: Snapshot): Component[] {
  const listed = config.components.flatMap((source) => listedIn(files, source))
  const slugs = new Set<string>()
  for (const { slug } of listed) {
    if (slugs.has(slug)) throw new Error(`two components are named ${slug}`)
    slugs.add(slug)
  }
  const specifiers = new Set(
    listed.flatMap(({ slug, source }) => source.importFrom?.replaceAll("{slug}", slug) ?? []),
  )
  const parsed = listed.map((entry) => {
    const tsx = entry.files.filter(([path]) => path.endsWith(".tsx")).map(([, text]) => text)
    return {
      entry,
      exports: tsx.flatMap(exportedNames),
      imports: new Set(tsx.flatMap((text) => importedNames(text, specifiers))),
      reads: new Set(tokensReadIn(entry.files.map(([, text]) => text).join("\n"))),
    }
  })
  const exporter = new Map<string, number>()
  for (const [index, { entry, exports }] of parsed.entries())
    for (const name of exports) {
      const other = exporter.get(name)
      if (other !== undefined)
        throw new Error(`${name} is exported by ${parsed[other]?.entry.slug} and ${entry.slug}`)
      exporter.set(name, index)
    }
  const renders = parsed.map(
    (entry, index) =>
      new Set(
        [...entry.imports].flatMap((name) => {
          const child = exporter.get(name)
          return child === undefined || child === index ? [] : [child]
        }),
      ),
  )
  return parsed.map(({ entry, exports, reads }, index): Component => {
    const seen = new Set<number>([index])
    const queue = [...(renders[index] ?? [])]
    const childReads = new Set<TokenName>()
    for (let child = queue.pop(); child !== undefined; child = queue.pop()) {
      if (seen.has(child)) continue
      seen.add(child)
      for (const token of parsed[child]?.reads ?? []) childReads.add(token)
      queue.push(...(renders[child] ?? []))
    }
    const { slug, source, props } = entry
    return {
      slug,
      title: slug.replaceAll(/(?:^|-)(\w)/g, (_, letter: string) => letter.toUpperCase()),
      group: source.group,
      naming: source.naming,
      href: source.href?.replaceAll("{slug}", slug) ?? null,
      importFrom: source.importFrom?.replaceAll("{slug}", slug) ?? null,
      exports,
      files: entry.files.map(([path]) => path),
      reads,
      childReads,
      props,
    }
  })
}

/**
 * The design system a config describes. Pure: the same config and snapshot give the same model,
 * so building it per request needs no cache.
 */
export function buildDesignSystem(config: TuneConfig, files: Snapshot): DesignSystem {
  const ordered = new Map(config.tokens.files.flatMap((pattern) => matching(files, pattern)))
  const sources = [...ordered].map(([path, css]): TokenFile => ({
    path,
    css,
    tier: config.tokens.tiers.find((rule) => matchesGlob(path, rule.files))?.tier ?? "semantic",
    owned: !path.split("/").includes("node_modules"),
  }))
  const components = componentsOf(config, files)
  return {
    tokens: buildTokens(sources, themeModelOf(config.tokens.themes)),
    components,
    plumbing: config.plumbing,
  }
}

export function readDesignSystem(root: string, config: TuneConfig): DesignSystem {
  return buildDesignSystem(config, snapshotOf(root, config))
}

/** Component imports without reading or constructing the token graph. */
export function readImportable(
  root: string,
  config: TuneConfig,
): { specifier: string; names: string[] }[] {
  return importsOf(componentsOf(config, snapshot(root, config, [])))
}

/** Each specifier the agent may import components from, with the names it imports there. */
export function importableOf(ds: DesignSystem): { specifier: string; names: string[] }[] {
  return importsOf(ds.components)
}

function importsOf(components: readonly Component[]): { specifier: string; names: string[] }[] {
  const names = new Map<string, string[]>()
  for (const { importFrom, exports } of components)
    if (importFrom !== null) names.set(importFrom, [...(names.get(importFrom) ?? []), ...exports])
  return [...names].map(([specifier, imported]) => ({ specifier, names: imported }))
}

export function componentFor(ds: DesignSystem, exportName: string): Component | undefined {
  return ds.components.find((component) => component.exports.includes(exportName))
}
