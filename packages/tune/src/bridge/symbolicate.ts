// oxlint-disable-next-line import/no-nodejs-modules -- resolved sources are files of the repo.
import { isAbsolute, relative, resolve } from "node:path"

import { type RawSourceMap, SourceMapConsumer } from "source-map-js"

import { RepoPath, type SourceLoc } from "../variant/model"
import { type SourceFile, sourceFileOf } from "./source-name"

/** A frame of an owner stack as the browser printed it, `<url>:<line>:<col>`, 1-based. */
export interface Frame {
  url: string
  line: number
  col: number
}

/** How a bundler's dev server maps frames of the code it serves back to files of the repo. */
export interface Bundler {
  symbolicate(root: string, frames: readonly Frame[]): Promise<(SourceLoc | null)[]>
}

/** The source map of one generated file, and the folder its module-relative names start from. */
export interface Mapped {
  map: RawSourceMap
  dir: string | null
  /** Lines before the first line the frames count from, when they count from a module, not the file. */
  offset?: number
}

/** The folders a bundler's `project` and `context` source names start from. */
export interface Bases {
  project: string
  context: string
}

const SOURCE_MAP = /\/\/# sourceMappingURL=(\S+)\s*$/gm

/** The `sourceMappingURL` of generated code; the last one wins, as in a browser. */
export const mapLinkOf = (code: string) => [...code.matchAll(SOURCE_MAP)].at(-1)?.[1]

function repoPathOf(root: string, file: SourceFile, bases: Bases, dir: string | null) {
  const base = { absolute: "/", project: bases.project, context: bases.context, module: dir }[
    file.from
  ]
  if (base === null) return null
  const path = relative(root, resolve(base, file.path))
  if (isAbsolute(path) || path.startsWith("..") || path.split("/").includes("node_modules"))
    return null
  const parsed = RepoPath.safeParse(path)
  return parsed.success ? parsed.data : null
}

/**
 * Maps each frame through the source map `mapOf` finds for its file, or to `null` for a frame in a
 * library, outside the repo, or in a file without a map. Each file's map is read once per call,
 * since HMR replaces them between calls.
 */
export async function mapFrames(
  root: string,
  frames: readonly Frame[],
  bases: Bases,
  mapOf: (url: string) => Promise<Mapped | null>,
): Promise<(SourceLoc | null)[]> {
  const found = new Map<
    string,
    Promise<{ consumer: SourceMapConsumer; dir: string | null; offset: number } | null>
  >()
  return Promise.all(
    frames.map(async ({ url, line, col }) => {
      if (!found.has(url))
        found.set(
          url,
          mapOf(url).then((mapped) =>
            mapped
              ? {
                  consumer: new SourceMapConsumer(mapped.map),
                  dir: mapped.dir,
                  offset: mapped.offset ?? 0,
                }
              : null,
          ),
        )
      const mapped = await found.get(url)
      const at = mapped?.consumer.originalPositionFor({
        line: line + mapped.offset,
        column: col - 1,
      })
      // An unmapped position comes back with a null source, whatever the typings say.
      if (!mapped || !at?.source) return null
      const file = sourceFileOf(at.source)
      const path = file && repoPathOf(root, file, bases, mapped.dir)
      return path ? { path, line: at.line, col: at.column + 1 } : null
    }),
  )
}
