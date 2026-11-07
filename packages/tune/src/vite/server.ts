import type { ViteDevServer } from "vite"

import { tuneHandler } from "../bridge/handler"
import { type TuneConfigInput } from "../core/config"
import { nodeHandler } from "./node"
import { viteBundler } from "./symbolicate"

/** Mounts the bridge on Vite's dev server at `base`, serving the checkout of Vite's root. */
export function serve(server: ViteDevServer, config: TuneConfigInput, base: string) {
  const handle = tuneHandler(config, { bundler: viteBundler(server), dir: server.config.root })
  server.middlewares.use(base, nodeHandler(handle))
}
