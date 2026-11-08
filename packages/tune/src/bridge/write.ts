// oxlint-disable-next-line import/no-nodejs-modules -- released edits write working-tree files.
import { writeFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { readFile, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { declarationFor } from "../core/design-system"
import { editError, type TokenEdit } from "../core/edit"
import { normalizeValue } from "../core/graph"
import { applyEdits } from "../core/write"
import { movedTag, setAttribute, swapClass } from "../dial/jsx"
import type { Dialed, DialWrite } from "../dial/model"
import type { PropWrite, PropWritten } from "../dial/props"
import { scalesOf, swapError } from "../dial/utilities"
import { type Journal, type Refusal, RepoPath } from "../variant/model"
import { holdersOf } from "../variant/swap"
import { formatFile } from "./checks"
import { readDesignSystem } from "./design-system"
import type { Host } from "./git"
import { withLive } from "./live"
import { propControls } from "./props"
import { type Done } from "./session"

const refuse = (refusal: Refusal): Done<never> => ({ ok: false, ...refusal })
type UtilityWrite = Extract<DialWrite, { kind: "utility" }>
type Command = DialWrite | { kind: "prop"; write: PropWrite }
/** A dependency failed while reading or writing the released edit. */
export type WriteFailure = {
  ok: false
  kind: "write-failed"
  operation: "read-design-system" | "load-controls" | "read-source" | "write-source"
  resource: string
  cause: unknown
}
type WriteResult<T> = Done<T> | WriteFailure

function tokensOf(repo: Host) {
  try {
    return { ok: true, tokens: readDesignSystem(repo.root, repo.config).tokens } as const
  } catch (cause) {
    return {
      ok: false,
      kind: "write-failed",
      operation: "read-design-system",
      resource: repo.root,
      cause,
    } as const
  }
}

function writeToken(repo: Host, now: Journal, edit: TokenEdit): WriteResult<Dialed> {
  const found = tokensOf(repo)
  if (!found.ok) return found
  const { tokens } = found
  const themes = tokens.themes.list.map((theme) => theme.name)
  if (edit.scope !== "all" && !themes.includes(edit.scope))
    return refuse({ kind: "invalid", detail: `${edit.scope} is not a theme` })
  const node = tokens.graph.get(edit.token)
  const file = node?.declarations[0]?.file ?? ""
  if (
    node &&
    (edit.scope === "all" ? themes : [edit.scope]).every(
      (theme) => declarationFor(tokens, node, theme).value === normalizeValue(edit.to),
    )
  )
    return { ok: true, value: { changed: false, file } }
  const error = editError(tokens, edit)
  if (error !== undefined) return refuse({ kind: "invalid", detail: error })
  const written = applyEdits(tokens, [edit])
  const on = holdersOf(
    now.leases,
    [...written.files.keys()].map((path) => RepoPath.parse(path)),
  )
  if (on.length > 0) return refuse({ kind: "held", on })
  for (const [path, css] of written.files) {
    try {
      writeFileSync(join(repo.root, path), css)
    } catch (cause) {
      return { ok: false, kind: "write-failed", operation: "write-source", resource: path, cause }
    }
  }
  return { ok: true, value: { changed: true, file: [...written.files.keys()].join(", ") } }
}

async function writeJsx(
  repo: Host,
  now: Journal,
  command: UtilityWrite | { kind: "prop"; write: PropWrite },
): Promise<WriteResult<Dialed | PropWritten>> {
  const write = command.kind === "prop" ? command.write : command
  const { site } = write
  if (command.kind === "utility") {
    const found = tokensOf(repo)
    if (!found.ok) return found
    const error = swapError(command.from, command.to, scalesOf(found.tokens))
    if (error !== undefined) return refuse({ kind: "invalid", detail: error })
  } else {
    const { component, name, to } = command.write
    let controls
    try {
      controls = await propControls(repo, component)
    } catch (cause) {
      return {
        ok: false,
        kind: "write-failed",
        operation: "load-controls",
        resource: component,
        cause,
      }
    }
    const control = controls.find((entry) => entry.name === name)
    if (control === undefined)
      return refuse({ kind: "invalid", detail: `${component} has no ${name} control` })
    const allowed: readonly (string | boolean)[] =
      control.kind === "enum" ? control.options : [true, false]
    if (to !== null && !allowed.includes(to))
      return refuse({ kind: "invalid", detail: `${component} takes no ${name} ${String(to)}` })
  }
  if (!/\.(?:tsx|jsx)$/.test(site.path))
    return refuse({ kind: "invalid", detail: `${site.path} is not JSX` })
  const on = holdersOf(now.leases, [site.path])
  if (on.length > 0) return refuse({ kind: "held", on })
  const file = join(repo.root, site.path)
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      (cause.code === "ENOENT" || cause.code === "ENOTDIR")
    )
      return refuse({ kind: "not-found" })
    return { ok: false, kind: "write-failed", operation: "read-source", resource: site.path, cause }
  }
  const edited =
    command.kind === "utility"
      ? swapClass(text, site.line, site.col, command.from, command.to)
      : setAttribute(text, site, command.write.tag, command.write.name, command.write.to)
  if (!edited.ok) return refuse({ kind: "invalid", detail: edited.reason })
  if (!edited.changed)
    return {
      ok: true,
      value:
        command.kind === "utility" ? { changed: false, file: site.path } : { changed: false, site },
    }
  try {
    await writeFile(file, edited.text)
  } catch (cause) {
    return {
      ok: false,
      kind: "write-failed",
      operation: "write-source",
      resource: site.path,
      cause,
    }
  }
  const formattedResult = await formatFile(repo, site.path)
  const warning = formattedResult.ok
    ? undefined
    : `Edit applied, but formatting failed: ${String(formattedResult.cause)}`
  if (command.kind === "utility")
    return { ok: true, value: { changed: true, file: site.path, ...(warning ? { warning } : {}) } }
  const formatted = await readFile(file, "utf8").catch(() => edited.text)
  const moved = movedTag(text, formatted, site, command.write.tag) ?? site
  return {
    ok: true,
    value: { changed: true, site: { path: site.path, ...moved }, ...(warning ? { warning } : {}) },
  }
}

/**
 * Writes a released dial or prop under the live lock, refusing only a file a shown variant holds.
 * Dependency failures are returned with their original cause; lock and unexpected failures throw.
 */
export function writeReleased(repo: Host, command: DialWrite): Promise<WriteResult<Dialed>>
export function writeReleased(
  repo: Host,
  command: { kind: "prop"; write: PropWrite },
): Promise<WriteResult<PropWritten>>
export function writeReleased(
  repo: Host,
  command: Command,
): Promise<WriteResult<Dialed | PropWritten>> {
  return withLive(repo, async (now) =>
    command.kind === "token" ? writeToken(repo, now, command) : writeJsx(repo, now, command),
  )
}
