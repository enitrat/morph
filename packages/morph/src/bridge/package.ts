// oxlint-disable-next-line import/no-nodejs-modules -- host bundles resolve subprocess entrypoints by package name.
import { createRequire } from "node:module"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

/** Resolves Morph from the host, where bundled bridge code cannot use its own source path. */
export const packageDir = (): string =>
  dirname(createRequire(join(process.cwd(), "host.js")).resolve("@enitrat/morph/package.json"))
