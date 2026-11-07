// oxlint-disable-next-line import/no-nodejs-modules -- module files are paths on disk.
import { dirname } from "node:path"

import { type RawSourceMap } from "source-map-js"
import type { ViteDevServer } from "vite"

import { type Bundler, mapFrames } from "../bridge/symbolicate"

/**
 * Vite's dev server: a frame maps through the source map of the module it names, as Vite's module
 * graph holds it after the last transform.
 */
export function viteBundler(server: ViteDevServer): Bundler {
  const root = server.config.root
  return {
    symbolicate: (repo, frames) =>
      mapFrames(repo, frames, { project: root, context: root }, async (url) => {
        if (!/^https?:/.test(url)) return null
        const graph = server.environments.client.moduleGraph
        const module = await graph.getModuleByUrl(new URL(url).pathname)
        const map = module?.transformResult?.map
        if (!module?.file || !map || !("mappings" in map)) return null
        return { map: map as unknown as RawSourceMap, dir: dirname(module.file) }
      }),
  }
}
