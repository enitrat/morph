// oxlint-disable-next-line import/no-nodejs-modules -- the bridge drives the git CLI.
import { spawn } from "node:child_process"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { copyFile, lstat, mkdir, rm } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { isAbsolute, join, relative, resolve, sep } from "node:path"

import { MorphConfig, MorphConfigInputSchema, type MorphConfigInput } from "../core/config"
import { BlobId, CommitId, type Content, RepoPath } from "../variant/model"
import { type Store } from "../variant/swap"

/** A checkout: `root` is its working tree, `dir` its own git dir (not the one worktrees share). */
export interface Repo {
  readonly root: string
  readonly dir: string
}

/** A checkout Morph serves, with the design-system config its host passed in. */
export interface Host extends Repo {
  readonly config: MorphConfig
}

/** Converts consumer paths to Git-relative identities and records the app location. */
export function configAt(repo: Repo, dir: string, input: MorphConfigInput): MorphConfig {
  const config = MorphConfig.parse(MorphConfigInputSchema.parse(input))
  const appRoot = relative(repo.root, resolve(dir))
  if (appRoot === ".." || appRoot.startsWith(`..${sep}`) || isAbsolute(appRoot))
    throw new Error("morph: app directory must be inside the Git checkout")
  const base = config.pathBase === "app" ? appRoot : ""
  const path = (value: string): string => {
    if (isAbsolute(value)) throw new Error(`morph: path must be inside the Git checkout: ${value}`)
    const result = relative(repo.root, resolve(repo.root, base, value))
    if (result === ".." || result.startsWith(`..${sep}`) || isAbsolute(result) || result === "")
      throw new Error(`morph: path must be inside the Git checkout: ${value}`)
    return result.split(sep).join("/") + (value.endsWith("/") ? "/" : "")
  }
  return {
    ...config,
    pathBase: "repo",
    appRoot: appRoot.split(sep).join("/"),
    tokens: {
      ...config.tokens,
      files: config.tokens.files.map(path),
      tiers: config.tokens.tiers.map((rule) => ({ ...rule, files: path(rule.files) })),
    },
    components: config.components.map((source) =>
      source.kind === "files"
        ? { ...source, files: path(source.files) }
        : { ...source, meta: path(source.meta) },
    ),
    plumbing: config.plumbing.map((rule) => ({ ...rule, prefix: path(rule.prefix) })),
  }
}

/** This checkout's Morph state directory. */
export const homeOf = (repo: Repo) => join(repo.dir, "morph")

/** Per-worktree refs: another checkout of the same repo neither sees nor collects them. */
export const REFS = "refs/worktree/morph"

interface Run {
  code: number
  stdout: Buffer
  stderr: string
}

/** Resolves on any exit a caller can read (merge-file reports conflicts as 1 to 127). */
function run(cwd: string, args: readonly string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, GIT_LITERAL_PATHSPECS: "1", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      const done = {
        code: code ?? -1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString().trim(),
      }
      if (done.code < 0 || done.code > 127)
        reject(new Error(`git ${args.join(" ")}: ${done.stderr}`))
      else resolve(done)
    })
  })
}

export async function git(
  cwd: string,
  args: readonly string[],
  env?: Record<string, string>,
): Promise<Buffer> {
  const { code, stdout, stderr } = await run(cwd, args, env)
  if (code !== 0) throw new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`)
  return stdout
}

/** `git grep` output lines, `path:line:text`; none when nothing matches. */
export async function grep(cwd: string, args: readonly string[]): Promise<string[]> {
  const { code, stdout, stderr } = await run(cwd, ["grep", ...args])
  if (code > 1) throw new Error(`git grep ${args.join(" ")} exited ${code}: ${stderr}`)
  return stdout.toString().split("\n").filter(Boolean)
}

export function absent(error: NodeJS.ErrnoException): null {
  if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
  throw error
}

const line = async (cwd: string, args: readonly string[]) =>
  (await git(cwd, args)).toString().trim()

export async function openRepo(dir: string): Promise<Repo> {
  const [root, gitDir] = (
    await line(dir, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir"])
  ).split("\n") as [string, string]
  return { root, dir: gitDir }
}

/**
 * Commits the working tree as it is now, untracked files included, without touching the index.
 * Each of `overrides` replaces that path's content (`null` leaves it out).
 */
export async function snapshot(
  repo: Repo,
  overrides: ReadonlyMap<RepoPath, Content> = new Map(),
): Promise<CommitId> {
  const index = join(homeOf(repo), `index-${randomUUID()}`)
  await mkdir(homeOf(repo), { recursive: true })
  // Starting from the real index lets `add -A` skip files whose stat is unchanged.
  await copyFile(
    await line(repo.root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]),
    index,
  )
  try {
    const env = { GIT_INDEX_FILE: index }
    await git(repo.root, ["add", "-A"], env)
    for (const [path, content] of overrides) {
      if (content === null) {
        await git(repo.root, ["update-index", "--force-remove", "--", path], env)
        continue
      }
      const staged = (await git(repo.root, ["ls-files", "--stage", "--", path], env))
        .toString()
        .trim()
      const mode = staged === "" ? "100644" : staged.split(" ")[0]
      await git(
        repo.root,
        ["update-index", "--add", "--cacheinfo", `${mode},${content},${path}`],
        env,
      )
    }
    const tree = (await git(repo.root, ["write-tree"], env)).toString().trim()
    return CommitId.parse(
      await line(repo.root, ["commit-tree", tree, "-p", "HEAD", "-m", "morph base"]),
    )
  } finally {
    await rm(index, { force: true })
  }
}

export async function readBlob(repo: Repo, blob: BlobId): Promise<Buffer> {
  return git(repo.root, ["cat-file", "blob", blob])
}

/** The working-tree content of `path`, stored as a blob so merges can read it. */
export async function liveContent(repo: Repo, path: RepoPath): Promise<Content> {
  const file = await lstat(join(repo.root, path)).catch(absent)
  if (file === null || file.isDirectory()) return null
  if (!file.isFile()) throw new Error(`morph only swaps regular files: ${path}`)
  return BlobId.parse(await line(repo.root, ["hash-object", "-w", "--", path]))
}

async function contentAt(repo: Repo, commit: CommitId, path: RepoPath): Promise<Content> {
  const entry = (await git(repo.root, ["ls-tree", "-z", commit, "--", path])).toString()
  const [mode, type, id] = entry.split(/[ \t]/)
  if (type !== "blob") return null
  if (mode === "120000") throw new Error(`morph only swaps regular files: ${path}`)
  return BlobId.parse(id)
}

export async function merge3(
  repo: Repo,
  ours: BlobId,
  base: BlobId,
  theirs: BlobId,
): Promise<BlobId | null> {
  const { code, stdout } = await run(repo.root, ["merge-file", "--object-id", ours, base, theirs])
  return code === 0 ? BlobId.parse(stdout.toString().trim()) : null
}

export async function changedFiles(
  repo: Repo,
  base: CommitId,
  commit: CommitId,
): Promise<RepoPath[]> {
  const out = await git(repo.root, [
    "diff-tree",
    "-r",
    "-z",
    "--no-renames",
    "--name-only",
    base,
    commit,
  ])
  return out
    .toString()
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => RepoPath.parse(path))
}

/** Commits the tree of `dir`'s working tree, untracked files included, on top of `parent`. */
export async function commitTree(
  dir: string,
  parent: CommitId,
  message: string,
): Promise<CommitId> {
  await git(dir, ["add", "-A"])
  const tree = await line(dir, ["write-tree"])
  return CommitId.parse(await line(dir, ["commit-tree", tree, "-p", parent, "-m", message]))
}

export async function updateRef(repo: Repo, ref: string, commit: CommitId): Promise<void> {
  await git(repo.root, ["update-ref", ref, commit])
}

export function gitStore(repo: Repo): Store {
  return {
    live: (path) => liveContent(repo, path),
    at: (commit, path) => contentAt(repo, commit, path),
    merge3: (ours, base, theirs) => merge3(repo, ours, base, theirs),
  }
}
