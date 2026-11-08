// oxlint-disable-next-line import/no-nodejs-modules -- the bridge writes the working tree.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

import {
  type CommitId,
  EMPTY_JOURNAL,
  type FileWrite,
  Journal,
  type Refusal,
  type RepoPath,
  Seq,
  type SessionId,
} from "../variant/model"
import {
  designerTree,
  type Offer,
  plan,
  type Placed,
  type Request,
  type Store,
} from "../variant/swap"
import { absent, gitStore, homeOf as home, readBlob, type Repo, snapshot } from "./git"
import { withLock } from "./lock"

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

/** The journal as it is on disk, read without the lock: a move may be under way. */
export async function readJournal(repo: Repo): Promise<Journal> {
  const text = await readFile(journalPath(repo), "utf8").catch(absent)
  return text === null ? EMPTY_JOURNAL : Journal.parse(JSON.parse(text))
}

async function writeJournal(repo: Repo, journal: Journal): Promise<void> {
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

/**
 * Finishes a move a crash interrupted: a file already holding `write` is done, one holding
 * `expect` is written, anything else is stuck. The wants and leases already name where the move
 * ends, so recovery only clears `moving`.
 */
async function recover(repo: Repo, store: Store, now: Journal): Promise<Journal> {
  if (now.moving === null) return now
  const stuck: RepoPath[] = []
  for (const write of now.moving) {
    const live = await store.live(write.path)
    if (live === write.write) continue
    if (live === write.expect) await put(repo, write)
    else stuck.push(write.path)
  }
  const settled = { ...now, stuck: [...new Set([...now.stuck, ...stuck])], moving: null }
  await writeJournal(repo, settled)
  return settled
}

function locked<T>(repo: Repo, body: (store: Store, now: Journal) => Promise<T>): Promise<T> {
  return withLock(join(home(repo), "lock"), async () => {
    const store = gitStore(repo)
    return body(store, await recover(repo, store, await readJournal(repo)))
  })
}

export type Converged =
  | { ok: true; journal: Journal; places: ReadonlyMap<SessionId, Placed> }
  | { ok: false; refusal: Refusal }

/**
 * The only writer of the working tree. Under the live lock it finishes a crashed move, reads the
 * open sessions, plans `request`, writes the journal, then the files, then the journal again
 * without `moving`. A plan that changes nothing writes nothing, so a poll leaves the disk alone.
 */
export function converge(
  repo: Repo,
  offers: () => Promise<readonly Offer[]>,
  request: Request,
): Promise<Converged> {
  return locked(repo, async (store, now) => {
    const planned = await plan(store, now, await offers(), request)
    if (!planned.ok) return planned
    if (planned.writes.length > 0) {
      await writeJournal(repo, planned.journal)
      for (const write of planned.writes) await put(repo, write)
    }
    const journal = { ...planned.journal, moving: null }
    if (planned.writes.length > 0 || JSON.stringify(journal) !== JSON.stringify(now))
      await writeJournal(repo, journal)
    return { ok: true, journal, places: planned.places }
  })
}

/**
 * The commit a new session stands on, and its place in the open order: the working tree with
 * every shown variant taken out, so no session's base holds another's undecided change.
 */
export function baseOf(repo: Repo): Promise<{ base: CommitId; opened: Seq }> {
  return locked(repo, async (store, now) => {
    const opened = Seq.parse(now.seq + 1)
    await writeJournal(repo, { ...now, seq: opened })
    return { base: await snapshot(repo, await designerTree(store, now.leases)), opened }
  })
}

/** Runs `body` under the live-tree lock, after finishing an interrupted move. */
export function withLive<T>(repo: Repo, body: (now: Journal) => Promise<T>): Promise<T> {
  return locked(repo, async (_, now) => body(now))
}
