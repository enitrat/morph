// oxlint-disable-next-line import/no-nodejs-modules -- the scope check reads the slot's manifests.
import { existsSync, readFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

import { createPathsMatcher, getTsconfig } from "get-tsconfig"

import { RepoPath } from "../variant/model"
import { workspaceOf } from "./workspaces"

/** What a variant may not do: add a package, change the build, or fake a module's types. */
interface Breach {
  path: RepoPath
  line: number
  kind: "package" | "build" | "missing"
  detail: string
}

/** How `spec`, imported by the file at `from`, resolves in the checkout. */
type Resolution = "resolves" | "no-package" | "no-file"
type Resolve = (from: RepoPath, spec: string) => Resolution

/** The one sentence a designer reads for each kind of breach. */
export const DESIGNER: Record<Breach["kind"], string> = {
  package: "Variants can't add packages. Ask for it with what the design system has.",
  build: "Variants can't change the build setup. Ask for it with what the design system has.",
  missing: "A variant imported a file that doesn't exist.",
}

const MANIFESTS =
  /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|\.npmrc)$/
const BUILD = /(?:^|\/)(?:tsconfig[\w.-]*\.json|(?:next|vite)\.config\.[cm]?[jt]s)$/
const SHIM = /\.d\.[cm]?ts$/
const CODE = /\.(?:[cm]?[jt]sx?)$/
const SPECIFIERS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /^\s*import\s+["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
]

function pathBreach(path: RepoPath): Breach | null {
  if (MANIFESTS.test(path))
    return {
      path,
      line: 1,
      kind: "package",
      detail: "Variants never change a package manifest or lockfile. Restore this file.",
    }
  if (BUILD.test(path))
    return {
      path,
      line: 1,
      kind: "build",
      detail: "Variants never change TypeScript, Next, or Vite config. Restore this file.",
    }
  if (SHIM.test(path))
    return {
      path,
      line: 1,
      kind: "package",
      detail: "Variants never add type declaration files. Delete this file.",
    }
  return null
}

/**
 * Every breach in a variant's change: a touched path it may not touch, and in the added lines of
 * the zero-context `diff`, a `declare module` shim or an import specifier that does not resolve
 * from the importing file. Removed lines never breach.
 */
export function breachesIn(
  diff: string,
  touched: readonly RepoPath[],
  resolve: Resolve,
  importable: readonly string[],
): Breach[] {
  const from = [...importable, "what the file already imports"].join(" and ")
  const found = touched.flatMap((path) => pathBreach(path) ?? [])
  let path: RepoPath | null = null
  let line = 0
  for (const text of diff.split("\n")) {
    const file = /^\+\+\+ b\/(.+)$/.exec(text)
    if (file) {
      path = RepoPath.parse(file[1])
      continue
    }
    const hunk = /^@@ -\S+ \+(\d+)/.exec(text)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (!text.startsWith("+") || path === null || !CODE.test(path)) continue
    const added = text.slice(1)
    if (/\bdeclare\s+module\b/.test(added))
      found.push({
        path,
        line,
        kind: "package",
        detail: "Variants never declare module types. Remove this declaration.",
      })
    for (const pattern of SPECIFIERS) {
      for (const [, spec = ""] of added.matchAll(pattern)) {
        const resolution = resolve(path, spec)
        if (resolution === "no-package")
          found.push({
            path,
            line,
            kind: "package",
            detail: `"${spec}" is not a dependency of this file's workspace. Remove it and build the change from ${from}.`,
          })
        if (resolution === "no-file")
          found.push({
            path,
            line,
            kind: "missing",
            detail: `"${spec}" names no file. Import a module that exists.`,
          })
      }
    }
    line += 1
  }
  return found
}

/** `@scope/name` or `name`: the package a bare specifier imports from. */
const packageOf = (spec: string) =>
  spec
    .split("/")
    .slice(0, spec.startsWith("@") ? 2 : 1)
    .join("/")

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json"]
const CANDIDATES = [...EXTENSIONS, ...EXTENSIONS.slice(1).map((ext) => `/index${ext}`)]

const readJson = (file: string): Record<string, unknown> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {}

const file = (base: string): Resolution =>
  CANDIDATES.some((ext) => existsSync(`${base}${ext}`)) ? "resolves" : "no-file"

/**
 * Resolution as the dev server sees it, read from the checkout at `dir`: a relative or
 * tsconfig-aliased import names a file that exists; a bare one names a package the importing
 * workspace lists in its `package.json`, or the workspace itself; `node:` builtins resolve.
 */
export function resolverAt(dir: string): Resolve {
  return (from, spec) => {
    if (spec.startsWith("node:")) return "resolves"
    const workspace = join(dir, workspaceOf(dir, from))
    if (spec.startsWith(".")) return file(join(dir, dirname(from), spec))
    const tsconfig = getTsconfig(join(dir, dirname(from)))
    let matchesAlias = false
    if (tsconfig !== null) {
      const candidates = createPathsMatcher(tsconfig)?.(spec) ?? []
      if (candidates.some((candidate) => file(candidate) === "resolves")) return "resolves"
      const aliases = Object.keys(tsconfig.config.compilerOptions?.paths ?? {})
      matchesAlias = aliases.some((alias) => {
        const star = alias.indexOf("*")
        return star < 0
          ? alias === spec
          : spec.startsWith(alias.slice(0, star)) &&
              spec.endsWith(alias.slice(star + 1)) &&
              spec.length >= alias.length - 1
      })
    }
    const manifest = readJson(join(workspace, "package.json"))
    const listed = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ].flatMap((field) => Object.keys((manifest[field] ?? {}) as Record<string, string>))
    if ([...listed, manifest.name].includes(packageOf(spec))) return "resolves"
    return matchesAlias ? "no-file" : "no-package"
  }
}
