// oxlint-disable-next-line import/no-nodejs-modules -- checks run the repo's own CLIs.
import { execFile, spawn } from "node:child_process"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { existsSync, readFileSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join, relative } from "node:path"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { promisify } from "node:util"

import { type MorphConfig } from "../core/config"
import { type RepoPath } from "../variant/model"
import { readImportable } from "./design-system"
import { type Host } from "./git"
import { breachesIn, DESIGNER, resolverAt } from "./scope"
import { workspaceOf, workspacesIn } from "./workspaces"

/** `errors`: every tool's output, for the agent; `reason`: its first problems, for the designer. */
type Checked = { ok: true } | { ok: false; errors: string; reason: string }

const CODE = /\.(?:[cm]?[jt]sx?)$/
const FORMATTED = /\.(?:[cm]?[jt]sx?|css|json|md)$/
const ERRORS_MAX = 6000
const REASON_LINES = 3

/** oxlint's `apps/site/x.tsx:4:11: error jsx-a11y(alt-text): Missing alt. help: …`. */
const LINT_LINE = /^(\S+?):(\d+):\d+: (error|warning) [\w-]+\([\w-]+\): (.+?)(?: help: .*)?$/
/** tsgo's `app/x.tsx(3,9): error TS2322: Type …`. */
const TYPE_LINE = /^(\S+?)\((\d+),\d+\): (error) TS\d+: (.+)$/

/**
 * The first problems a checks run found, as `x.tsx:4 message` lines, errors before warnings and
 * each once; the first lines of its output when no tool line matches.
 */
export function reasonOf(output: string): string {
  const lines = output.split("\n").map((line) => line.trim())
  const found = lines.flatMap((line) => {
    const [, path = "", at = "", level = "", message = ""] =
      LINT_LINE.exec(line) ?? TYPE_LINE.exec(line) ?? []
    return message === ""
      ? []
      : [{ error: level === "error", text: `${path.split("/").at(-1)}:${at} ${message}` }]
  })
  const picked =
    found.length === 0
      ? lines.filter((line) => line !== "" && !line.endsWith(":"))
      : found.toSorted((a, b) => Number(b.error) - Number(a.error)).map((entry) => entry.text)
  return [...new Set(picked)].slice(0, REASON_LINES).join("\n")
}

/** Runs `bin` in `cwd`, and answers its output under `label` when it exits non-zero. */
function failureOf(label: string, cwd: string, bin: string, args: readonly string[]) {
  return new Promise<string | null>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    const collect = (chunk: Buffer) => {
      out += chunk.toString()
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.on("error", reject)
    child.on("close", (code) => {
      resolve(code === 0 ? null : `${label}:\n${out.trim()}`)
    })
  })
}

/** Resolves a check binary in its workspace, then the app and repository. */
export function commandAt(root: string, workspace: string, app: string, bin: string): string {
  const candidates = [...new Set([workspace, app, ""])].map((dir) =>
    join(root, dir, "node_modules", ".bin", bin),
  )
  return candidates.find(existsSync) ?? candidates[0] ?? bin
}

/**
 * `file` as a check's argument from `cwd`: relative inside it, absolute outside, since formatters
 * such as oxfmt refuse a path with `..` in it.
 */
function argPath(cwd: string, file: string): string {
  const path = relative(cwd, file)
  return path.startsWith("..") ? file : path
}

/** Formats a file with the host's configured command and retains the original failure. */
export async function formatFile(
  repo: Host,
  path: string,
): Promise<{ ok: true } | { ok: false; kind: "format-failed"; path: string; cause: unknown }> {
  const { bin, args } = repo.config.checks.format
  const cwd = join(repo.root, repo.config.appRoot)
  try {
    await promisify(execFile)(
      commandAt(repo.root, repo.config.appRoot, repo.config.appRoot, bin),
      [...args, argPath(cwd, join(repo.root, path))],
      { cwd },
    )
    return { ok: true }
  } catch (cause) {
    return { ok: false, kind: "format-failed", path, cause }
  }
}

/** `href="#"`, `href=""`, `href={"#"}`: a link that goes nowhere. */
const DEAD_HREF = /href=\{?\s*(["'`])#?\1\s*\}?/

/**
 * Lint-style lines for every added link in a zero-context diff that points nowhere. The agent
 * invents these "Read more" links even when told not to.
 */
export function deadLinksIn(diff: string): string[] {
  const found: string[] = []
  let path = ""
  let line = 0
  for (const text of diff.split("\n")) {
    const file = /^\+\+\+ b\/(.+)$/.exec(text)
    if (file) path = file[1] ?? ""
    const hunk = /^@@ -\S+ \+(\d+)/.exec(text)
    if (hunk) line = Number(hunk[1])
    else if (text.startsWith("+") && !text.startsWith("+++")) {
      if (DEAD_HREF.test(text))
        found.push(
          `${path}:${line}:1: error morph(dead-link): This link goes nowhere. Link to a real route or leave the link out.`,
        )
      line += 1
    }
  }
  return found
}

async function addedDiff(dir: string, paths: readonly string[]): Promise<string> {
  if (paths.length === 0) return ""
  // Files the agent created are untracked; intent-to-add puts them in the diff against the base.
  // The scope and dead-link checks read this diff, so a git failure fails the checks run.
  const added = await failureOf("git add", dir, "git", ["add", "--intent-to-add", "--", ...paths])
  if (added !== null) throw new Error(added)
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "-U0", "HEAD", "--", ...paths], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`git diff exited ${code}: ${err.trim()}`))
    })
  })
}

/** The projects owning changed paths and their transitive workspace dependents. */
async function projectsOf(dir: string, files: readonly RepoPath[]): Promise<string[]> {
  const owners = new Set(files.map((path) => workspaceOf(dir, path)))
  const workspaces = [...new Set(["", ...(await workspacesIn(dir))])]
  const manifests = workspaces.map((workspace) => {
    const path = join(dir, workspace, "package.json")
    const manifest: {
      name?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    } = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}
    return {
      workspace,
      name: manifest.name,
      dependencies: Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
      }),
    }
  })
  const pending = [...owners]
  for (const owner of pending) {
    const name = manifests.find((manifest) => manifest.workspace === owner)?.name
    if (name === undefined) continue
    for (const manifest of manifests) {
      if (!owners.has(manifest.workspace) && manifest.dependencies.includes(name)) {
        owners.add(manifest.workspace)
        pending.push(manifest.workspace)
      }
    }
  }
  return [...owners].filter((owner) => existsSync(join(dir, owner, "tsconfig.json"))).toSorted()
}

/**
 * Formats and lint-fixes the touched files in place with the config's commands, then lints them
 * and typechecks every project they reach, or the root. A scope breach fails with the designer's
 * sentence as the reason, since the dev server would not build it.
 */
export async function checks(
  dir: string,
  files: readonly RepoPath[],
  config: MorphConfig,
): Promise<Checked> {
  const present = files.filter((path) => existsSync(join(dir, path)))
  const code = present.filter((path) => CODE.test(path))
  const formatted = present.filter((path) => FORMATTED.test(path))
  const app = config.appRoot
  const cwd = join(dir, app)
  const appPaths = (paths: readonly string[]) => paths.map((path) => argPath(cwd, join(dir, path)))
  const bin = (name: string, workspace = app) => commandAt(dir, workspace, app, name)
  const { lint: linter, format: formatter, typecheck } = config.checks

  // Lint fixes run before formatting, which then settles whatever layout the fixes left.
  const lint =
    code.length === 0 || linter === null
      ? null
      : await failureOf(linter.bin, cwd, bin(linter.bin), [...linter.args, ...appPaths(code)])
  const format =
    formatted.length === 0
      ? null
      : await failureOf(formatter.bin, cwd, bin(formatter.bin), [
          ...formatter.args,
          ...appPaths(formatted),
        ])
  const projects =
    typecheck.scope === "workspace"
      ? await projectsOf(dir, files)
      : files.length > 0
        ? [typecheck.scope === "app" ? app : ""]
        : []
  const types = await Promise.all(
    projects.map((project) =>
      failureOf(
        project === "" ? typecheck.bin : `${typecheck.bin} in ${project}`,
        join(dir, project),
        bin(typecheck.bin, project),
        typecheck.args,
      ),
    ),
  )
  const diff = await addedDiff(dir, code)
  const dead = deadLinksIn(diff)
  const links = dead.length === 0 ? null : `links:\n${dead.join("\n")}`
  const importable = readImportable(dir, config).map(({ specifier }) => specifier)
  const breaches = breachesIn(diff, files, resolverAt(dir), importable)
  const scope =
    breaches.length === 0
      ? null
      : `scope:\n${breaches.map((breach) => `${breach.path}:${breach.line}:1: error morph(scope): ${breach.detail}`).join("\n")}`
  const failures = [scope, lint, format, links, ...types].filter((failure) => failure !== null)
  if (failures.length === 0) return { ok: true }
  return {
    ok: false,
    errors: failures.join("\n\n").slice(0, ERRORS_MAX),
    reason:
      breaches.length === 0
        ? reasonOf(failures.join("\n"))
        : [...new Set(breaches.map((breach) => DESIGNER[breach.kind]))].join("\n"),
  }
}
