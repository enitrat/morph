// Type-checks the site, then each scene under its own rootDirs. tsc resolves a variant's relative
// imports from its scene folder, as the scenes plugin does, so `./data` in `pass/asks/…/v1/`
// means `pass/data.ts`. One rootDirs set per scene keeps two scenes' `./data` apart.
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, join, relative } from "node:path"

import { rootDirsOf, scan } from "./scenes-plugin.ts"

const site = join(import.meta.dirname, "..")
const out = join(site, ".tsconfigs")
const tsc = join(site, "node_modules", ".bin", "tsc")

const scenes = scan(join(site, "scenes"), (message) => {
  throw new Error(`morph-scenes: ${message}`)
})

rmSync(out, { recursive: true, force: true })
mkdirSync(out)
const configs = scenes.map((scene) => {
  const file = join(out, `${basename(scene.dir)}.json`)
  const from = (dir: string) => relative(out, dir)
  const config = {
    extends: "../tsconfig.json",
    compilerOptions: { rootDirs: rootDirsOf([scene]).map(from) },
    include: [from(scene.dir), from(join(site, "stage"))],
    exclude: [],
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  return file
})

let failed = false
for (const project of [join(site, "tsconfig.json"), ...configs]) {
  try {
    execFileSync(tsc, ["--noEmit", "-p", project], { stdio: "inherit" })
  } catch {
    failed = true
    console.error(`typecheck failed: ${relative(site, project)}`)
  }
}
if (failed) process.exit(1)
