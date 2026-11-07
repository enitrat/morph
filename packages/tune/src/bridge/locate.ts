// oxlint-disable-next-line import/no-nodejs-modules -- resolved sources are files of the repo.
import { isAbsolute, relative } from "node:path"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { fileURLToPath } from "node:url"

import { type RawSourceMap, SourceMapConsumer } from "source-map-js"

import { RepoPath, type SourceLoc } from "../variant/model"

/** A stack frame of a fiber's `_debugStack`, in a chunk the dev server served. */
interface Frame {
  url: URL
  line: number
  col: number
}

const SOURCE_MAP = /\/\/# sourceMappingURL=(\S+)\s*$/gm
const TURBOPACK_PROJECT = "turbopack:///[project]/"

/** Turbopack names sources `file:///abs/path` or `turbopack:///[project]/repo/path`. */
function repoPathOf(root: string, source: string): RepoPath | null {
  const file = source.startsWith(TURBOPACK_PROJECT)
    ? source.slice(TURBOPACK_PROJECT.length)
    : source.startsWith("file://")
      ? relative(root, fileURLToPath(source))
      : null
  if (file === null || isAbsolute(file) || file.split("/").includes("node_modules")) return null
  const path = RepoPath.safeParse(file)
  return path.success ? path.data : null
}

async function consumerOf(chunk: string): Promise<SourceMapConsumer | null> {
  const js = await fetch(chunk)
  if (!js.ok) return null
  // The last link wins, as in a browser: bundled code may contain the marker in a string.
  const link = [...(await js.text()).matchAll(SOURCE_MAP)].at(-1)?.[1]
  if (link === undefined) return null
  const map = await fetch(new URL(link, chunk))
  return map.ok ? new SourceMapConsumer((await map.json()) as RawSourceMap) : null
}

/**
 * Maps each frame through its chunk's source map to a repo file, or `null` for a frame in a
 * library, outside the repo, or in a chunk without a map. Each chunk and map is fetched once per
 * call, since HMR replaces them between calls.
 */
export async function locate(
  root: string,
  frames: readonly Frame[],
): Promise<(SourceLoc | null)[]> {
  const consumers = new Map<string, Promise<SourceMapConsumer | null>>()
  return Promise.all(
    frames.map(async ({ url, line, col }) => {
      const chunk = url.href
      if (!consumers.has(chunk)) consumers.set(chunk, consumerOf(chunk))
      const consumer = await consumers.get(chunk)
      const at = consumer?.originalPositionFor({ line, column: col - 1 })
      // An unmapped position comes back with a null source, whatever the typings say.
      if (!at?.source) return null
      const path = repoPathOf(root, at.source)
      return path === null ? null : { path, line: at.line, col: at.column + 1 }
    }),
  )
}
