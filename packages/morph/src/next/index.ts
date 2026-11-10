import { type MorphConfigInput } from "../core/config"
import { morphHandler } from "../bridge/handler"
import { nextBundler } from "./symbolicate"

/**
 * The Morph bridge as the route handlers of a Next dynamic route, `app/<base>/[op]/route.dev.ts`.
 * It serves the git checkout of the folder `next dev` runs in.
 */
export function morphRoute(input: MorphConfigInput) {
  const app = process.cwd()
  const handle = morphHandler(input, { bundler: nextBundler(app), dir: app })
  const route = async (request: Request, { params }: { params: Promise<{ op: string }> }) =>
    handle(request, (await params).op)
  return { GET: route, POST: route, OPTIONS: route }
}
