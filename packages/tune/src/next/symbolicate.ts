// oxlint-disable-next-line import/no-nodejs-modules -- Server Component chunks are read from disk.
import { readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, relative, resolve } from "node:path"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { fileURLToPath } from "node:url"

import { type RawSourceMap } from "source-map-js"

import { absent } from "../bridge/git"
import { type Bundler, type Mapped, mapFrames, mapLinkOf } from "../bridge/symbolicate"

/** A Server Component frame replayed in the browser: `about://React/Server/file:///…js?7`. */
const SERVER_FRAME = /^(?:about|rsc):\/\/React\/[^/]+\/(file:\/\/[^?#]+)/

/** A client chunk, fetched from the dev server that served it, as the browser did. */
async function clientMap(url: string): Promise<Mapped | null> {
  const js = await fetch(url)
  if (!js.ok) return null
  const link = mapLinkOf(await js.text())
  if (link === undefined) return null
  const map = await fetch(new URL(link, url))
  return map.ok ? { map: (await map.json()) as RawSourceMap, dir: null } : null
}

const inside = (root: string, file: string) => !relative(root, file).startsWith("..")

/** A server chunk Next wrote below the repo, read from disk with the map beside it. */
async function serverMap(root: string, file: string): Promise<Mapped | null> {
  if (!inside(root, file) || !file.endsWith(".js")) return null
  const code = await readFile(file, "utf8").catch(absent)
  const link = code === null ? undefined : mapLinkOf(code)
  if (link === undefined || link.includes(":")) return null
  const mapFile = resolve(dirname(file), decodeURIComponent(link))
  if (!inside(root, mapFile)) return null
  const map = await readFile(mapFile, "utf8").catch(absent)
  return map === null ? null : { map: JSON.parse(map) as RawSourceMap, dir: dirname(file) }
}

/**
 * Next's dev server, with Turbopack or webpack: a client frame maps through the chunk it names,
 * a Server Component frame through the server chunk on disk. `app` is the Next app's folder.
 */
export function nextBundler(app: string): Bundler {
  return {
    symbolicate: (root, frames) =>
      mapFrames(root, frames, { project: root, context: app }, (url) => {
        const server = SERVER_FRAME.exec(url)?.[1]
        if (server !== undefined) return serverMap(root, fileURLToPath(server))
        return /^https?:/.test(url) ? clientMap(url) : Promise.resolve(null)
      }),
  }
}
