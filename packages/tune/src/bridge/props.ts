// oxlint-disable-next-line import/no-nodejs-modules -- the write edits a working-tree file.
import { readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { attributesIn, type Attribute } from "../dial/jsx"
import { type ComponentUses, type PropWrite, type PropWritten } from "../dial/props"
import { componentUseCount } from "../syntax/source"
import type { SourceLoc } from "../variant/model"
import { absent, grep, type Host, type Repo } from "./git"
import type { Done } from "./session"
import { writeReleased } from "./write"

/** The tag at `site`: its name and attributes; `null` when no JSX tag starts there. */
export async function tagAttributes(
  repo: Repo,
  site: SourceLoc,
): Promise<{ name: string; attributes: Attribute[] } | null> {
  if (!/\.(?:tsx|jsx)$/.test(site.path)) return null
  const text = await readFile(join(repo.root, site.path), "utf8").catch(absent)
  return (text === null ? undefined : attributesIn(text, site.line, site.col)) ?? null
}

/** Tests, end-to-end suites and fixtures, which render a component without shipping it. */
const isTestCode = (path: string) =>
  /\.(?:test|spec)\.[jt]sx$/.test(path) || /(?:^|\/)(?:e2e|fixtures)\//.test(path)

/**
 * The JSX uses of `component`, defined in `definedIn`, in the repo's source files outside test
 * code. Another file's use counts only when that file imports the name, so a namesake elsewhere
 * does not.
 */
export async function componentUses(
  repo: Repo,
  component: string,
  definedIn: string,
): Promise<ComponentUses> {
  const found = await grep(repo.root, ["--untracked", "-l", "-F", "<"])
  const paths = found.filter((path) => /\.(?:tsx|jsx)$/.test(path) && !isTestCode(path))
  const counted = await Promise.all(
    paths.map(async (path) => {
      const text = await readFile(join(repo.root, path), "utf8").catch(absent)
      return {
        path,
        count: text === null ? 0 : componentUseCount(text, component, path === definedIn),
      }
    }),
  )
  const examples = counted.filter(({ path }) => path.includes("/examples/"))
  const total = (entries: typeof counted) => entries.reduce((sum, { count }) => sum + count, 0)
  return { uses: total(counted) - total(examples), examples: total(examples) }
}

/** Sets one prop, refusing while a session owns the working tree. */
export async function writeProp(repo: Host, write: PropWrite): Promise<Done<PropWritten>> {
  const result = await writeReleased(repo, { kind: "prop", write })
  if (!result.ok && "failure" in result) throw result.failure.cause
  return result
}
