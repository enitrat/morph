// oxlint-disable-next-line import/no-nodejs-modules -- the bridge writes the token sources.
import { writeFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

export function writeSources(repo: string, files: ReadonlyMap<string, string>): void {
  for (const [path, css] of files) writeFileSync(join(repo, path), css)
}
