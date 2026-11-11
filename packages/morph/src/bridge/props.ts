// oxlint-disable-next-line import/no-nodejs-modules -- lab controls load the repository's TypeScript meta.
import { execFile } from "node:child_process"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { readFile, stat } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { createRequire } from "node:module"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { promisify } from "node:util"

import { cvaControls } from "../dial/cva"
import { attributesIn, type Attribute } from "../dial/jsx"
import { controlsOf, type ComponentUses, type PropControl } from "../dial/props"
import { componentUseCount } from "../syntax/source"
import type { SourceLoc } from "../variant/model"
import { componentFor, readDesignSystem } from "./design-system"
import { absent, grep, type Host, type Repo } from "./git"
import { packageDir } from "./package"

const run = promisify(execFile)

/** Prints a meta's component and Playground controls as JSON; its path is the first argument. */
const PRINT_CONTROLS =
  "import(require('node:url').pathToFileURL(process.argv[1]).href).then(({ meta }) => process.stdout.write(JSON.stringify({ component: meta.component, controls: meta.controls })))"

const loaded = new Map<string, { mtime: number; controls: Promise<PropControl[]> }>()

/** `component`'s controls from its lab meta's Playground, loaded once until the meta changes. */
async function labMetaControls(repo: Host, meta: string, component: string) {
  const path = join(repo.root, meta)
  const { mtimeMs } = await stat(path)
  const cached = loaded.get(path)
  if (cached?.mtime === mtimeMs) return cached.controls
  const tsx = createRequire(join(packageDir(), "package.json")).resolve("tsx/cli")
  const controls = run(process.execPath, [tsx, "-e", PRINT_CONTROLS, path], {
    cwd: repo.root,
  }).then(({ stdout }) => controlsOf(JSON.parse(stdout), component))
  loaded.set(path, { mtime: mtimeMs, controls })
  controls.catch(() => loaded.delete(path))
  return controls
}

/**
 * The props a designer can set on `component`, from where its design system describes them: a
 * lab meta's Playground controls or a `cva()` its props type reads. None for a component outside
 * the design system, or one its source does not describe, such as a part.
 */
export async function propControls(repo: Host, component: string): Promise<PropControl[]> {
  const props = componentFor(readDesignSystem(repo.root, repo.config), component)?.props
  if (props?.kind === "lab-meta") return labMetaControls(repo, props.meta, component)
  if (props?.kind === "cva")
    return cvaControls(await readFile(join(repo.root, props.file), "utf8"), component)
  return []
}

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
