// Writes tsconfig.scenes.json: tsc resolves a variant file's relative imports from its scene
// folder, as the scenes plugin does, so `./ReceiptTotal` type-checks from `asks/invoice/v1/`.
import { readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

import { rootDirsOf, scan } from "./scenes-plugin.ts"

const site = join(import.meta.dirname, "..")
const file = join(site, "tsconfig.scenes.json")

export function rootDirsConfig(): string {
  const scenes = scan(join(site, "scenes"), (message) => {
    throw new Error(`morph-scenes: ${message}`)
  })
  const rootDirs = rootDirsOf(scenes).map((dir) => `./${relative(site, dir)}`)
  return `${JSON.stringify({ compilerOptions: { rootDirs } }, null, 2)}\n`
}

if (import.meta.main) {
  const next = rootDirsConfig()
  let now = ""
  try {
    now = readFileSync(file, "utf8")
  } catch {}
  if (now !== next) writeFileSync(file, next)
}
