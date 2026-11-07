// oxlint-disable-next-line import/no-nodejs-modules -- write paths are resolved on disk.
import { realpath } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"

import { absent } from "./git"

/** `path` with its symlinks resolved, through the nearest ancestor that exists. */
async function settled(path: string): Promise<string> {
  const real = await realpath(path).catch(absent)
  if (real !== null) return real
  const parent = dirname(path)
  return parent === path ? path : join(await settled(parent), basename(path))
}

/** The `writes` an agent run in `dir` aimed outside it, symlinks followed. */
export async function outside(dir: string, writes: readonly string[]): Promise<string[]> {
  const root = await realpath(dir)
  const escaped = await Promise.all(
    writes.map(async (write) => {
      const way = relative(root, await settled(resolve(root, write)))
      return way === ".." || way.startsWith("../") || isAbsolute(way)
    }),
  )
  return writes.filter((_, index) => escaped[index])
}
