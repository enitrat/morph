import {
  type Applied,
  type AppliedFile,
  type BlobId,
  type CommitId,
  type Content,
  type FileWrite,
  type RepoPath,
  type Target,
} from "./model"

/** The object store and the working tree, as `planSwap` reads them. */
export interface Store {
  live(path: RepoPath): Promise<Content>
  at(commit: CommitId, path: RepoPath): Promise<Content>
  /** A line-level three-way merge; `null` when the two sides touch the same lines. */
  merge3(ours: BlobId, base: BlobId, theirs: BlobId): Promise<BlobId | null>
}

type Plan =
  | { ok: true; to: Applied | null; writes: readonly FileWrite[] }
  | { ok: false; conflicts: readonly RepoPath[] }

const CONFLICT = Symbol("conflict")

async function merge3(
  store: Store,
  ours: Content,
  base: Content,
  theirs: Content,
): Promise<Content | typeof CONFLICT> {
  if (ours === base) return theirs
  if (theirs === base || ours === theirs) return ours
  if (ours === null || base === null || theirs === null) return CONFLICT
  return (await store.merge3(ours, base, theirs)) ?? CONFLICT
}

/**
 * Moves the live tree from `now` to `target` (`null` is no variant), per path that either touches:
 * 1. origin: the live content with the applied variant taken out. A designer edit to an applied
 *    file survives, because origin is then merge3(live, after, before).
 * 2. next: origin with the target put in, merge3(origin, base, variant), which keeps what the
 *    designer changed after the base was taken.
 * 3. a write wherever next differs from live.
 * Any conflicting merge fails the whole plan, so nothing is written.
 */
export async function planSwap(
  store: Store,
  now: Applied | null,
  target: Target | null,
): Promise<Plan> {
  const applied = new Map((now?.files ?? []).map((file) => [file.path, file]))
  const paths = [...new Set([...applied.keys(), ...(target?.files ?? [])])].toSorted()
  const wanted = new Set(target?.files)
  const writes: FileWrite[] = []
  const files: AppliedFile[] = []
  const conflicts: RepoPath[] = []

  for (const path of paths) {
    const live = await store.live(path)
    const was = applied.get(path)
    const origin = was === undefined ? live : await merge3(store, live, was.after, was.before)
    if (origin === CONFLICT) {
      conflicts.push(path)
      continue
    }
    let next = origin
    if (target !== null && wanted.has(path)) {
      const merged = await merge3(
        store,
        origin,
        await store.at(target.base, path),
        await store.at(target.commit, path),
      )
      if (merged === CONFLICT) {
        conflicts.push(path)
        continue
      }
      next = merged
      files.push({ path, before: origin, after: next })
    }
    if (next !== live) writes.push({ path, expect: live, write: next })
  }

  if (conflicts.length > 0) return { ok: false, conflicts }
  const to = target === null ? null : { session: target.session, variant: target.variant, files }
  return { ok: true, to, writes }
}
