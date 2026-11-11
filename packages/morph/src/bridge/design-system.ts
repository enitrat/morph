// oxlint-disable-next-line import/no-nodejs-modules -- the shell globs and reads the repo's files.
import { globSync, readdirSync, readFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join, matchesGlob, posix } from "node:path"

import { buildTokens } from "../core/graph"
import {
  type Component,
  type DesignSystem,
  type PropSource,
  themeModelOf,
  type TokenFile,
  type TokenName,
} from "../core/design-system"
import { tokensReadIn } from "../core/usage"
import { type ComponentSource, type MorphConfig } from "../core/config"
import { moduleNames } from "../syntax/source"

/** Every file the config's globs match, path to text. */
export type Snapshot = ReadonlyMap<string, string>

/** A lab-meta folder's own sources: its components and their tokens, tests apart. */
const isFolderSource = (name: string) =>
  (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) || name.endsWith(".tokens.css")

function snapshot(root: string, config: MorphConfig, tokenFiles: readonly string[]): Snapshot {
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

export function snapshotOf(root: string, config: MorphConfig): Snapshot {
  return snapshot(root, config, config.tokens.files)
}

const byPath = ([a]: [string, string], [b]: [string, string]) => (a < b ? -1 : a > b ? 1 : 0)

/** The snapshot's files a glob matches, sorted by path, as `globSync(...).toSorted()` lists them. */
const matching = (files: Snapshot, pattern: string) =>
  [...files].filter(([path]) => matchesGlob(path, pattern)).toSorted(byPath)

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
function componentsOf(config: MorphConfig, files: Snapshot): Component[] {
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
    const modules = tsx.map((text) => moduleNames(text, specifiers))
    return {
      entry,
      exports: modules.flatMap((module) => module.exports),
      namedExports: modules.flatMap((module) => module.namedExports),
      imports: new Set(modules.flatMap((module) => module.imports)),
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
  return parsed.map(({ entry, exports, namedExports, reads }, index): Component => {
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
      namedExports,
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
export function buildDesignSystem(config: MorphConfig, files: Snapshot): DesignSystem {
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

export function readDesignSystem(root: string, config: MorphConfig): DesignSystem {
  return buildDesignSystem(config, snapshotOf(root, config))
}

/** Component imports without reading or constructing the token graph. */
export function readImportable(
  root: string,
  config: MorphConfig,
): { specifier: string; names: string[] }[] {
  const components = componentsOf(config, snapshot(root, config, []))
  const names = new Map<string, string[]>()
  for (const { importFrom, namedExports } of components)
    if (importFrom !== null)
      names.set(importFrom, [...(names.get(importFrom) ?? []), ...namedExports])
  return [...names].map(([specifier, imported]) => ({ specifier, names: imported }))
}

export function componentFor(ds: DesignSystem, exportName: string): Component | undefined {
  return ds.components.find((component) => component.exports.includes(exportName))
}
