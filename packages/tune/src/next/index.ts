import { type TuneConfigInput } from "../core/config"
import { tuneHandler } from "../bridge/handler"
import { nextBundler } from "./symbolicate"

/**
 * The Tune bridge as the route handlers of a Next dynamic route, `app/<base>/[op]/route.dev.ts`.
 * It serves the git checkout of the folder `next dev` runs in.
 */
export function tuneRoute(input: TuneConfigInput) {
  const app = process.cwd()
  const handle = tuneHandler(input, { bundler: nextBundler(app), dir: app })
  const route = async (request: Request, { params }: { params: Promise<{ op: string }> }) =>
    handle(request, (await params).op)
  return { GET: route, POST: route, OPTIONS: route }
}
