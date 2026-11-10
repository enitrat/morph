import { type RawSourceMap, SourceMapConsumer } from "source-map-js"

import { canonical } from "./manifest"
import { RepoPath, type SourceLoc } from "./wire"

const FRAME = /^(.+):(\d+):(\d+)$/
/** Where the site's own sources sit in the repo; a map's sources are relative to this folder. */
const SITE = "site"
const OWN = /^\/(?:scenes|src|stage)\//

const maps = new Map<string, Promise<SourceMapConsumer | null>>()

function mapOf(url: string): Promise<SourceMapConsumer | null> {
  let found = maps.get(url)
  if (found === undefined) {
    found = fetch(`${url}.map`)
      .then((response) => (response.ok ? (response.json() as Promise<RawSourceMap>) : null))
      .then((map) => (map === null ? null : new SourceMapConsumer(map)))
      .catch(() => null)
    maps.set(url, found)
  }
  return found
}

/**
 * Same-origin frames, `https://host/assets/index-abc.js:242:1543`, through the chunk's own source
 * map to the repo file it was built from, as the real bridge does with its dev server's maps. A
 * variant's file reads as the path it stands for once written; a library frame is `null`.
 */
export async function symbolicate(frames: readonly string[]): Promise<(SourceLoc | null)[]> {
  return Promise.all(
    frames.map(async (frame) => {
      const [, url, line, col] = FRAME.exec(frame) ?? []
      if (url === undefined || !url.startsWith(location.origin)) return null
      const consumer = await mapOf(url)
      const at = consumer?.originalPositionFor({ line: Number(line), column: Number(col) - 1 })
      // An unmapped position comes back with a null source, whatever the typings say.
      if (!at?.source) return null
      const { pathname } = new URL(at.source, url)
      if (!OWN.test(pathname)) return null
      const path = RepoPath.safeParse(canonical(`${SITE}${pathname}`))
      return path.success ? { path: path.data, line: at.line, col: at.column + 1 } : null
    }),
  )
}
