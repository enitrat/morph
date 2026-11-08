// oxlint-disable-next-line import/no-nodejs-modules -- reads JSX from the working tree.
import { readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { type DesignSystemWire, toWire } from "../core/design-system"
import { classesIn } from "../dial/jsx"
import type { SourceLoc } from "../variant/model"
import { readDesignSystem } from "./design-system"
import { absent, type Host, type Repo } from "./git"

/** The current design system serialized for the browser. */
export const designSystemOf = (repo: Host): DesignSystemWire =>
  toWire(readDesignSystem(repo.root, repo.config), repo.config.tokens.themes)

const isJsx = (path: string) => /\.(?:tsx|jsx)$/.test(path)

/** The classes the JSX tag at `site` writes once each: the ones a dial may swap. */
export async function tagClasses(repo: Repo, site: SourceLoc): Promise<string[]> {
  if (!isJsx(site.path)) return []
  const text = await readFile(join(repo.root, site.path), "utf8").catch(absent)
  return text === null ? [] : classesIn(text, site.line, site.col)
}
