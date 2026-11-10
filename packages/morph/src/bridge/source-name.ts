// The rules for reading a bundler's source names are adapted from bippy's normalize-file-name.ts
// (MIT, https://github.com/aidenybai/bippy).

/**
 * The file a source-map source names: an absolute path, or a path below the bundler's project
 * root (Turbopack's `[project]`), its context (webpack's `./`, the app's folder), or the module
 * the map belongs to (Vite's relative names).
 */
export type SourceFile =
  | { from: "absolute"; path: string }
  | { from: "project"; path: string }
  | { from: "context"; path: string }
  | { from: "module"; path: string }

const SERVER_PREFIX = /^(?:about|rsc):\/\/React\/[^/]+\//
const BUNDLER_SCHEME = /^(turbopack|webpack|webpack-internal|rspack|rspack-internal):\/\//
const WEBPACK_LAYER =
  /^\/?\((?:app-pages-browser|action-browser|api-edge|api-node|edge-asset|instrument|middleware|pages-dir-browser|pages-dir-edge|pages-dir-node|rsc|shared|ssr)\)\//
const WEBPACK_NAMESPACE = /^(?:_N_E\/|[^/]+\/(?=\.\.?\/))/
const TURBOPACK_PROJECT = /^\/?\[project\]\//
const MODULE_SUFFIX =
  /\s(?:\[(?:app-[a-z0-9-]+|action-browser|api-edge|api-node|middleware|pages-dir-[a-z]+|rsc|shared|ssr)\]|\((?:asset|client reference proxy|css[^)]*|ecmascript[^)]*|javascript|json|typescript|unknown)\)|<(?:exports?|locals|namespace)[^>]*>)$/
const VIRTUAL = /^(?:\0|virtual:|__x00__)/

function stripSuffixes(path: string): string {
  let stripped = path
  for (let suffix = MODULE_SUFFIX.exec(stripped); suffix; suffix = MODULE_SUFFIX.exec(stripped))
    stripped = stripped.slice(0, suffix.index).trimEnd()
  return stripped
}

/** Decodes each `%xx` segment, keeping encoded separators so a segment never splits. */
function decodeSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      if (!segment.includes("%") || /%(?:2f|5c)/i.test(segment)) return segment
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join("/")
}

/** `a/./b/../c` to `a/c`; a leading `..` that climbs out of the base stays. */
function collapse(path: string): string {
  const segments: string[] = []
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") segments.pop()
    else segments.push(segment)
  }
  return (path.startsWith("/") ? "/" : "") + segments.join("/")
}

/** The file a source name points to, or `null` for a virtual module or a nameless frame. */
export function sourceFileOf(name: string): SourceFile | null {
  let path = name.replace(SERVER_PREFIX, "")
  let from: SourceFile["from"] = "module"
  const scheme = BUNDLER_SCHEME.exec(path)
  if (path.startsWith("file://")) {
    path = path.slice("file://".length).replace(/^localhost(?=\/)/, "")
  } else if (scheme) {
    path = path.slice(scheme[0].length)
    if (scheme[1] !== "turbopack") {
      path = path
        .replace(WEBPACK_LAYER, "")
        .replace(/^\/(?=\.)/, "")
        .replace(WEBPACK_NAMESPACE, "")
      from = "context"
    }
  } else if (path.startsWith("/@fs/")) {
    path = path.slice("/@fs".length)
  } else if (path.startsWith("/@id/")) {
    path = path.slice("/@id/".length)
  }
  if (path === "" || path === "<anonymous>" || VIRTUAL.test(path)) return null
  if (TURBOPACK_PROJECT.test(path)) {
    path = path.replace(TURBOPACK_PROJECT, "")
    from = "project"
  }
  path = decodeSegments(stripSuffixes(path).replace(/[?#].*$/, ""))
  if (path.startsWith("/")) return { from: "absolute", path: collapse(path) }
  return { from, path: collapse(path) }
}
