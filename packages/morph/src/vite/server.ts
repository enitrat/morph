import type { ViteDevServer } from "vite"

import { morphHandler } from "../bridge/handler"
import { type MorphConfigInput } from "../core/config"
import { nodeHandler } from "./node"
import { viteBundler } from "./symbolicate"

/** Mounts the bridge on Vite's dev server at `base`, serving the checkout of Vite's root. */
export function serve(server: ViteDevServer, config: MorphConfigInput, base: string) {
  const handle = morphHandler(config, { bundler: viteBundler(server), dir: server.config.root })
  server.middlewares.use(base, nodeHandler(handle))
}
