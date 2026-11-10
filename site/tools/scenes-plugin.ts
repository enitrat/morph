import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative } from "node:path"

import { structuredPatch } from "diff"
import type { Plugin } from "vite"

const ID = "virtual:morph-scenes"
const RESOLVED = `\0${ID}`
const VARIANTS = ["v1", "v2", "v3"] as const
const CODE = /\.tsx?$/

export interface ScenesOptions {
  /** The folder that holds one folder per scene. */
  readonly scenes: string
  /** The repo root, which every path the overlay sees is relative to. */
  readonly repo: string
}

/** File name to text: one revision's code files, as they read at the scene's canonical paths. */
type Files = ReadonlyMap<string, string>

const dirsIn = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isDirectory())
        .sort()
    : []

const codeIn = (dir: string) =>
  readdirSync(dir)
    .filter((name) => CODE.test(name) && name !== "scene.ts" && name !== "ask.ts")
    .sort()

function changes(before: Files, after: Files) {
  const files: string[] = []
  let add = 0
  let del = 0
  for (const [name, text] of after) {
    const old = before.get(name) ?? ""
    if (old === text) continue
    files.push(name)
    for (const hunk of structuredPatch(name, name, old, text).hunks)
      for (const line of hunk.lines) {
        if (line.startsWith("+")) add++
        else if (line.startsWith("-")) del++
      }
  }
  return { files, stat: { add, del } }
}

/**
 * `virtual:morph-scenes`: the scenes folder as a revision tree, with every variant's changed files
 * and line stat computed here and each variant's component split into its own lazy chunk. The
 * build fails on an ask without all of v1, v2 and v3, or on a variant that does not export the
 * scene's entry.
 */
export function scenes({ scenes: root, repo }: ScenesOptions): Plugin {
  return {
    name: "morph-scenes",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined
      const imports: string[] = []
      const bind = (spec: string, from: string) => {
        const name = `m${imports.length}`
        imports.push(`import ${spec.replace("$", name)} from ${JSON.stringify(from)}`)
        return name
      }
      const fail = (message: string): never => this.error(`morph-scenes: ${message}`)

      const asksIn = (dir: string, entry: string, parent: Files, sceneDir: string): string =>
        `[${dirsIn(join(dir, "asks"))
          .map((slug) => {
            const askDir = join(dir, "asks", slug)
            if (!existsSync(join(askDir, "ask.ts"))) fail(`${askDir} has no ask.ts`)
            const variants = VARIANTS.map((variant) => {
              const at = join(askDir, variant)
              const file = join(at, `${entry}.tsx`)
              if (!existsSync(file)) fail(`${askDir} has no ${variant}/${entry}.tsx`)
              if (
                !new RegExp(`export (function|const) ${entry}\\b`).test(readFileSync(file, "utf8"))
              )
                fail(`${file} does not export ${entry}`)
              if (!existsSync(join(at, "meta.json"))) fail(`${at} has no meta.json`)
              const files = new Map(parent)
              for (const name of codeIn(at)) files.set(name, readFileSync(join(at, name), "utf8"))
              const changed = changes(parent, files)
              if (changed.files.length === 0) fail(`${at} changes nothing`)
              const paths = changed.files.map((name) => relative(repo, join(sceneDir, name)))
              this.addWatchFile(file)
              return `{ id: "${variant}", meta: ${bind("$", join(at, "meta.json"))}, files: ${JSON.stringify(paths)}, stat: ${JSON.stringify(changed.stat)}, load: () => import(${JSON.stringify(file)}).then((m) => m.${entry}), asks: ${asksIn(at, entry, files, sceneDir)} }`
            })
            return `{ slug: ${JSON.stringify(slug)}, ask: ${bind("$", join(askDir, "ask.ts"))}, variants: [${variants.join(", ")}] }`
          })
          .join(", ")}]`

      const list = dirsIn(root).map((id) => {
        const dir = join(root, id)
        if (!existsSync(join(dir, "scene.ts"))) fail(`${dir} has no scene.ts`)
        const top = codeIn(dir).filter((name) => name.endsWith(".tsx"))
        if (top.length !== 1) fail(`${dir} needs exactly one top-level .tsx, its entry`)
        const entry = basename(top[0] ?? "", ".tsx")
        const original = new Map(
          codeIn(dir).map((name) => [name, readFileSync(join(dir, name), "utf8")]),
        )
        const Entry = bind(`{ ${entry} as $ }`, join(dir, `${entry}.tsx`))
        return `{ id: ${JSON.stringify(id)}, scene: ${bind("$", join(dir, "scene.ts"))}, dir: ${JSON.stringify(relative(repo, dir))}, entry: ${JSON.stringify(entry)}, Entry: ${Entry}, asks: ${asksIn(dir, entry, original, dir)} }`
      })
      return `${imports.join("\n")}\nexport const scenes = [${list.join(", ")}]\n`
    },
  }
}
