// oxlint-disable-next-line import/no-nodejs-modules -- slots are git worktrees on disk.
import { createHash } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { globSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { cp, mkdir, readdir, realpath, stat, symlink } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { tmpdir } from "node:os"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { type CommitId } from "../variant/model"
import { absent, git, type Repo } from "./git"
import { tryLock, unlock } from "./lock"
import { workspacesIn } from "./workspaces"

export const SLOT_IDS = [0, 1, 2] as const
type SlotId = (typeof SLOT_IDS)[number]

interface Slot {
  readonly id: SlotId
  readonly dir: string
}

const exists = async (path: string) => (await stat(path).catch(absent)) !== null

/** Copies a tree with its symlinks verbatim, so a relative link resolves against the copy. */
const copy = (from: string, to: string) =>
  cp(from, to, { recursive: true, verbatimSymlinks: true, force: true })

/**
 * Gives the worktree `slot` the dependencies of `live` while keeping every workspace link inside
 * the slot. pnpm links workspace packages relatively (`../../packages/ui`), so those links are
 * copied, never symlinked. Only the package store, `node_modules/.pnpm/*`, is shared. A
 * workspace's own `node_modules` is found one or two folders below the root (`apps/site`).
 */
export async function farm(live: string, slot: string): Promise<void> {
  const from = join(live, "node_modules")
  const to = join(slot, "node_modules")
  const store = join(from, ".pnpm")
  await mkdir(join(to, ".pnpm"), { recursive: true })
  await Promise.all([
    ...(await readdir(from))
      .filter((entry) => entry !== ".pnpm")
      .map((entry) => copy(join(from, entry), join(to, entry))),
    ...(await readdir(store)).map((entry) =>
      entry === "node_modules"
        ? copy(join(store, entry), join(to, ".pnpm", entry))
        : symlink(join(store, entry), join(to, ".pnpm", entry)),
    ),
    ...globSync(["*/node_modules", "*/*/node_modules"], { cwd: live })
      .filter((modules) => !modules.startsWith("node_modules/"))
      .map((modules) => copy(join(live, modules), join(slot, modules))),
  ])
}

/** The slots of one checkout: two worktrees of the repo never share a slot. */
export async function slotsRoot(repo: Repo): Promise<string> {
  const id = createHash("sha256").update(repo.root).digest("hex").slice(0, 12)
  return join(await realpath(tmpdir()), `retouch-${id}`)
}

/** Resets the slot to `base`, creating its worktree and dependencies on first use. */
async function prepare(repo: Repo, dir: string, base: CommitId): Promise<void> {
  if (await exists(join(dir, ".git"))) {
    await git(dir, ["checkout", "--quiet", "--detach", "--force", base])
    await git(dir, ["clean", "-fdq"])
  } else {
    await git(repo.root, ["worktree", "prune"])
    await git(repo.root, ["worktree", "add", "--quiet", "--detach", "--force", dir, base])
  }
  if (!(await exists(join(dir, "node_modules")))) await farm(repo.root, dir)
  for (const workspace of await workspacesIn(repo.root)) {
    const types = join(workspace, ".next", "types")
    if (await exists(join(repo.root, types))) await copy(join(repo.root, types), join(dir, types))
  }
}

/** Takes a free slot for this process and checks `base` out in it. */
export async function acquire(repo: Repo, base: CommitId): Promise<Slot> {
  const root = await slotsRoot(repo)
  for (const id of SLOT_IDS) {
    const dir = join(root, `slot-${id}`)
    if (!(await tryLock(`${dir}.lock`))) continue
    try {
      await prepare(repo, dir, base)
      return { id, dir }
    } catch (error) {
      await unlock(`${dir}.lock`)
      throw error
    }
  }
  throw new Error("retouch: every slot is busy")
}

export async function release(slot: Slot): Promise<void> {
  await unlock(`${slot.dir}.lock`)
}
