// oxlint-disable-next-line import/no-nodejs-modules -- the dial writes working-tree files.
import { readFile, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import {
  applyEdits,
  declarationFor,
  type DesignSystemWire,
  editError,
  normalizeValue,
  type TokenEdit,
  toWire,
} from "../core"
import { classesIn, swapClass } from "../dial/jsx"
import { type Dialed, type DialWrite } from "../dial/model"
import { scalesOf, swapError } from "../dial/utilities"
import { type SourceLoc } from "../variant/model"
import { formatFile } from "./checks"
import { readDesignSystem } from "./design-system"
import { absent, type Host, type Repo } from "./git"
import { withLive } from "./live"
import { writeSources } from "./repo"
import { type Done, openSessions, type Refusal } from "./session"

const refuse = (refusal: Refusal): Done<never> => ({ ok: false, ...refusal })

export const designSystemOf = (repo: Host): DesignSystemWire =>
  toWire(readDesignSystem(repo.root, repo.config), repo.config.tokens.themes)

const isJsx = (path: string) => /\.(?:tsx|jsx)$/.test(path)

/** The classes the JSX tag at `site` writes once each: the ones a dial may swap. */
export async function tagClasses(repo: Repo, site: SourceLoc): Promise<string[]> {
  if (!isJsx(site.path)) return []
  const text = await readFile(join(repo.root, site.path), "utf8").catch(absent)
  return text === null ? [] : classesIn(text, site.line, site.col)
}

function writeToken(repo: Host, edit: TokenEdit): Done<Dialed> {
  const { tokens } = readDesignSystem(repo.root, repo.config)
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
  writeSources(repo.root, written.files)
  return { ok: true, value: { changed: true, file: [...written.files.keys()].join(", ") } }
}

async function writeClass(
  repo: Host,
  write: Extract<DialWrite, { kind: "utility" }>,
): Promise<Done<Dialed>> {
  const { site, from, to } = write
  const error = swapError(from, to, scalesOf(readDesignSystem(repo.root, repo.config).tokens))
  if (error !== undefined) return refuse({ kind: "invalid", detail: error })
  if (!isJsx(site.path)) return refuse({ kind: "invalid", detail: `${site.path} is not JSX` })
  const file = join(repo.root, site.path)
  const text = await readFile(file, "utf8").catch(absent)
  if (text === null) return refuse({ kind: "not-found" })
  const swapped = swapClass(text, site.line, site.col, from, to)
  if (!swapped.ok) return refuse({ kind: "invalid", detail: swapped.reason })
  if (swapped.changed) {
    await writeFile(file, swapped.text)
    try {
      await formatFile(repo, site.path)
    } catch (error) {
      return {
        ok: true,
        value: {
          changed: true,
          file: site.path,
          warning: `Edit applied, but formatting failed: ${String(error)}`,
        },
      }
    }
  }
  return { ok: true, value: { changed: swapped.changed, file: site.path } }
}

/**
 * Writes one released dial into the working tree. It refuses while a session is open, so a dial
 * never edits a file a variant still owns.
 */
export function dial(repo: Host, write: DialWrite): Promise<Done<Dialed>> {
  return withLive(repo, async (now) => {
    const open = now.applied?.session ?? (await openSessions(repo))[0]
    if (open !== undefined) return refuse({ kind: "busy", session: open })
    return write.kind === "token" ? writeToken(repo, write) : writeClass(repo, write)
  })
}
