// oxlint-disable-next-line import/no-nodejs-modules -- the bridge writes the working tree.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { chmod, mkdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"

import {
  type CommitId,
  type FileWrite,
  type Journal,
  Observation,
  type PageView,
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
import { type Checkpoint, readCheckpoint, withCheckpoint } from "./checkpoint"

async function replace(file: string, bytes: Buffer | string, scratch: string): Promise<void> {
  const tmp = join(scratch, `tmp-${randomUUID()}`)
  await mkdir(scratch, { recursive: true })
  await writeFile(tmp, bytes)
  const mode = (await stat(file).catch(absent))?.mode
  if (mode !== undefined) await chmod(tmp, mode)
  await mkdir(dirname(file), { recursive: true })
  await rename(tmp, file)
}

/** The journal as published on disk, without recovering an interrupted move. */
export async function readJournal(repo: Repo): Promise<Journal> {
  return (await readCheckpoint(repo)).value.journal
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
  return { ...now, stuck: [...new Set([...now.stuck, ...stuck])], moving: null }
}

/** A settled placement or a refusal that left the working tree unchanged. */
export type Converged =
  | { ok: true; journal: Journal; places: ReadonlyMap<SessionId, Placed> }
  | { ok: false; refusal: Refusal }

/** Operations available only while one checkout's live-tree lock is held. */
export interface LiveTree {
  /** The recovered journal, including changes made in this acquisition. */
  readonly journal: Journal
  /** Round states from the same checkpoint as the journal. */
  readonly rounds: Checkpoint["rounds"]
  /** Publishes round transitions that do not change the working tree. */
  publish(rounds: Checkpoint["rounds"]): Promise<void>
  /** Applies a placement decision through the write-ahead journal. */
  settle(
    offers: readonly Offer[],
    request: Request,
    rounds?: Checkpoint["rounds"],
  ): Promise<Converged>
  /** Captures the designer's code with shown variants removed, and reserves its open order. */
  base(): Promise<{ base: CommitId; opened: Seq }>
  /** Numbers a page captured in this acquisition. The counter survives server restarts. */
  observe(page: Omit<PageView, "observation">): Promise<PageView>
}

/** Recovers interrupted writes and owns the lock through mutation and observation of the tree. */
export function withLive<T>(repo: Repo, body: (tree: LiveTree) => Promise<T>): Promise<T> {
  return withCheckpoint(repo, async (checkpoint) => {
    const store = gitStore(repo)
    const recovered = await recover(repo, store, checkpoint.value.journal)
    if (recovered !== checkpoint.value.journal)
      await checkpoint.save({ ...checkpoint.value, journal: recovered })
    return body({
      get journal() {
        return checkpoint.value.journal
      },
      get rounds() {
        return checkpoint.value.rounds
      },
      async publish(rounds) {
        await checkpoint.save({ ...checkpoint.value, rounds })
      },
      async settle(offers, request, rounds = checkpoint.value.rounds) {
        const planned = await plan(store, checkpoint.value.journal, offers, request)
        if (!planned.ok) return planned
        const next = { ...checkpoint.value, rounds, journal: planned.journal }
        if (JSON.stringify(next) !== JSON.stringify(checkpoint.value)) await checkpoint.save(next)
        for (const write of planned.writes) await put(repo, write)
        if (planned.writes.length > 0)
          await checkpoint.save({
            ...checkpoint.value,
            journal: { ...checkpoint.value.journal, moving: null },
          })
        return { ok: true, journal: checkpoint.value.journal, places: planned.places }
      },
      async base() {
        const opened = Seq.parse(checkpoint.value.journal.seq + 1)
        const base = await snapshot(
          repo,
          await designerTree(store, checkpoint.value.journal.leases),
        )
        await checkpoint.save({
          ...checkpoint.value,
          journal: { ...checkpoint.value.journal, seq: opened },
        })
        return { base, opened }
      },
      async observe(page) {
        const observation = Observation.parse(checkpoint.value.observation + 1)
        await checkpoint.save({ ...checkpoint.value, observation })
        return { ...page, observation }
      },
    })
  })
}
