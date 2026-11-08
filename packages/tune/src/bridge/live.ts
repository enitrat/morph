// oxlint-disable-next-line import/no-nodejs-modules -- the bridge writes the working tree.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

import {
  type Applied,
  type FileWrite,
  AppliedJournal,
  type RepoPath,
  type SessionId,
  type Target,
} from "../variant/model"
import { planSwap, type Store } from "../variant/swap"
import { absent, gitStore, homeOf as home, readBlob, type Repo } from "./git"
import { withLock } from "./lock"

type LiveResult =
  | { ok: true; applied: Applied | null }
  | { ok: false; conflicts: readonly RepoPath[] }

const journalPath = (repo: Repo) => join(home(repo), "live.json")

async function replace(file: string, bytes: Buffer | string, scratch: string): Promise<void> {
  const tmp = join(scratch, `tmp-${randomUUID()}`)
  await mkdir(scratch, { recursive: true })
  await writeFile(tmp, bytes)
  const mode = (await stat(file).catch(absent))?.mode
  if (mode !== undefined) await chmod(tmp, mode)
  await mkdir(dirname(file), { recursive: true })
  await rename(tmp, file)
}

/** The journal as it is on disk, read without the lock: a swap may be under way. */
export async function readJournal(repo: Repo): Promise<AppliedJournal> {
  const text = await readFile(journalPath(repo), "utf8").catch(absent)
  return text === null ? { kind: "steady", applied: null } : AppliedJournal.parse(JSON.parse(text))
}

async function writeJournal(repo: Repo, journal: AppliedJournal): Promise<void> {
  await replace(journalPath(repo), JSON.stringify(journal), home(repo))
}

/** Removes the parents a deleted file leaves empty, as a variant that added them would expect. */
async function prune(repo: Repo, dir: string): Promise<void> {
  while (dir !== repo.root) {
    try {
      await rmdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY") return
      throw error
    }
    dir = dirname(dir)
  }
}

async function put(repo: Repo, { path, write }: FileWrite): Promise<void> {
  const file = join(repo.root, path)
  if (write === null) {
    await rm(file, { force: true })
    await prune(repo, dirname(file))
  } else await replace(file, await readBlob(repo, write), home(repo))
}

type Settled = Exclude<AppliedJournal, { kind: "moving" }>

/** Finishes a swap a crash interrupted: a file already holding `write` is done, one holding `expect` is written. */
async function recover(repo: Repo, store: Store, journal: AppliedJournal): Promise<Settled> {
  if (journal.kind !== "moving") return journal
  const conflicts: RepoPath[] = []
  for (const write of journal.writes) {
    const live = await store.live(write.path)
    if (live === write.write) continue
    if (live === write.expect) await put(repo, write)
    else conflicts.push(write.path)
  }
  const settled: Settled =
    conflicts.length === 0
      ? { kind: "steady", applied: journal.to }
      : { kind: "stuck", applied: journal.to, conflicts }
  await writeJournal(repo, settled)
  return settled
}

function locked<T>(repo: Repo, body: (store: Store, now: Settled) => Promise<T>): Promise<T> {
  return withLock(join(home(repo), "lock"), async () => {
    const store = gitStore(repo)
    return body(store, await recover(repo, store, await readJournal(repo)))
  })
}

/**
 * The only writer of the working tree: moves it to `target`, or to no variant. The journal is
 * written before any file, so the next call finishes a swap a crash interrupted.
 */
export function setLive(
  repo: Repo,
  target: Target | null,
  /** Decided under the lock: when false, nothing moves. */
  when: (applied: Applied | null) => boolean = () => true,
): Promise<LiveResult> {
  return locked(repo, async (store, now) =>
    when(now.applied) ? move(repo, store, now, target) : { ok: true, applied: now.applied },
  )
}

/** Runs `body` under the live-tree lock, after finishing an interrupted swap. */
export function withLive<T>(repo: Repo, body: (now: Settled) => Promise<T>): Promise<T> {
  return locked(repo, async (_, now) => body(now))
}

export function recoverLive(repo: Repo): Promise<AppliedJournal> {
  return locked(repo, async (_, now) => now)
}

async function move(
  repo: Repo,
  store: Store,
  now: Settled,
  target: Target | null,
): Promise<LiveResult> {
  const plan = await planSwap(store, now.applied, target)
  if (!plan.ok) return plan
  if (plan.writes.length > 0) {
    await writeJournal(repo, { kind: "moving", to: plan.to, writes: plan.writes })
    for (const write of plan.writes) await put(repo, write)
  }
  await writeJournal(repo, { kind: "steady", applied: plan.to })
  return { ok: true, applied: plan.to }
}

/** Leaves the shown variant's files in place and forgets it; a session no longer shown is a no-op. */
export function keep(repo: Repo, session: SessionId): Promise<void> {
  return locked(repo, async (_, now) => {
    if (now.applied?.session === session)
      await writeJournal(repo, { kind: "steady", applied: null })
  })
}
