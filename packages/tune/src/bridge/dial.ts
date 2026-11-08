// oxlint-disable-next-line import/no-nodejs-modules -- the dial writes working-tree files.
import { readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { applyEdits } from "../core/write"
import { type DesignSystemWire, toWire, } from "../core/design-system"
import { editError, type TokenEdit } from "../core/edit"
import { normalizeValue } from "../core/graph"
import { classesIn } from "../dial/jsx"
import type { Dialed, DialWrite } from "../dial/model"
import type { SourceLoc } from "../variant/model"
import { readDesignSystem } from "./design-system"
import { absent, type Host, type Repo } from "./git"
import type { Done } from "./session"
import { writeReleased } from "./write"

export const designSystemOf = (repo: Host): DesignSystemWire =>
  toWire(readDesignSystem(repo.root, repo.config), repo.config.tokens.themes)

const isJsx = (path: string) => /\.(?:tsx|jsx)$/.test(path)

/** The classes the JSX tag at `site` writes once each: the ones a dial may swap. */
export async function tagClasses(repo: Repo, site: SourceLoc): Promise<string[]> {
  if (!isJsx(site.path)) return []
  const text = await readFile(join(repo.root, site.path), "utf8").catch(absent)
  return text === null ? [] : classesIn(text, site.line, site.col)
}

/** Writes one released dial, refusing while a session owns the working tree. */
export async function dial(repo: Host, write: DialWrite): Promise<Done<Dialed>> {
  const result = await writeReleased(repo, write)
  if (!result.ok && "failure" in result) throw result.failure.cause
  return result
}
