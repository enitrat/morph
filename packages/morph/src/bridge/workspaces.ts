// oxlint-disable-next-line import/no-nodejs-modules -- workspaces are folders of the checkout.
import { existsSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join, posix } from "node:path"

import { git } from "./git"

/**
 * `apps/site` for `apps/site/app/x.tsx`: the nearest folder above `path` in the checkout at `dir`
 * that holds a `package.json`; `""`, the repo root, for a file outside every workspace.
 */
export function workspaceOf(dir: string, path: string): string {
  for (let at = posix.dirname(path); at !== "."; at = posix.dirname(at))
    if (existsSync(join(dir, at, "package.json"))) return at
  return ""
}

/** Every workspace of the checkout at `dir`: each folder below its root with a `package.json`. */
export async function workspacesIn(dir: string): Promise<string[]> {
  const files = (await git(dir, ["ls-files", "--cached", "--others", "--exclude-standard"]))
    .toString()
    .split("\n")
  return files.filter((path) => path.endsWith("/package.json")).map(posix.dirname)
}
