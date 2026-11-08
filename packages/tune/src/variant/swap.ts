import {
  type Applied,
  type AppliedFile,
  type BlobId,
  type By,
  type Choice,
  type CommitId,
  type Content,
  type FileWrite,
  type Hold,
  type Journal,
  type Lease,
  type Refusal,
  RepoPath,
  Seq,
  SessionId,
  type Target,
  type VariantId,
  type Want,
} from "./model"

/** The object store and the working tree, as the planner reads them. */
export interface Store {
  live(path: RepoPath): Promise<Content>
  at(commit: CommitId, path: RepoPath): Promise<Content>
  /** A line-level three-way merge; `null` when the two sides touch the same lines. */
  merge3(ours: BlobId, base: BlobId, theirs: BlobId): Promise<BlobId | null>
}

type SwapPlan =
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
): Promise<SwapPlan> {
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

/** An open session as the planner sees it: its ready variants, in v1..v3 order. */
export interface Offer {
  readonly session: SessionId
  readonly opened: Seq
  readonly ready: readonly Target[]
}

/** The edit an operation makes to the wants; `settle` edits none and is the poll. */
export type Request =
  | { readonly kind: "settle" }
  | { readonly kind: "show"; readonly session: SessionId; readonly choice: Choice }
  /** Shows `variant`, taking its files from any other session, then leaves it as code. */
  | { readonly kind: "keep"; readonly session: SessionId; readonly variant: VariantId }
  /** Takes the session's variant out, byte for byte. */
  | { readonly kind: "discard"; readonly session: SessionId }

/** Where a session stands after a plan. The view adds `edited`, which it reads from disk. */
export type Placed =
  | { readonly kind: "shown"; readonly variant: VariantId }
  | { readonly kind: "original" }
  | { readonly kind: "waiting"; readonly on: readonly Hold[] }
  /** Its files could not be moved: the code there changed over the same lines. */
  | {
      readonly kind: "conflict"
      readonly files: readonly RepoPath[]
      readonly showing: VariantId | null
    }

export type Plan =
  | {
      readonly ok: true
      /** The journal to write; `moving` holds `writes` when there are any. */
      readonly journal: Journal
      readonly writes: readonly FileWrite[]
      readonly places: ReadonlyMap<SessionId, Placed>
    }
  | { readonly ok: false; readonly refusal: Refusal }

type Rank = { readonly by: By | "closing"; readonly at: Seq }
interface Wish {
  readonly session: SessionId
  readonly target: Target | null
  readonly rank: Rank
}

const RANKS = { auto: 0, designer: 1, closing: 2 } as const

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Highest first: `closing` > `designer` > `auto`, then the newer want, then the session id. */
const byRank = (a: Wish, b: Wish) =>
  RANKS[b.rank.by] - RANKS[a.rank.by] || b.rank.at - a.rank.at || compare(a.session, b.session)

interface Layer {
  readonly variant: VariantId
  readonly leases: ReadonlyMap<RepoPath, Lease>
}

type Slot =
  | { readonly kind: "show"; readonly target: Target }
  | { readonly kind: "original" }
  | { readonly kind: "wait"; readonly on: readonly Hold[] }

/**
 * Who shows what, from the wishes alone. `held` layers claim their files first; then each wish, in
 * rank order, claims its target's files when none is claimed, or waits on the claimers. A waiting
 * wish claims nothing, so it never blocks a lower one.
 */
function assign(
  wishes: readonly Wish[],
  held: ReadonlyMap<SessionId, Layer>,
): Map<SessionId, Slot> {
  const claims = new Map<RepoPath, { session: SessionId; variant: VariantId }>()
  for (const [session, { variant, leases }] of held)
    for (const path of leases.keys()) claims.set(path, { session, variant })
  const slots = new Map<SessionId, Slot>()
  for (const { session, target } of wishes) {
    if (held.has(session)) continue
    if (target === null) {
      slots.set(session, { kind: "original" })
      continue
    }
    const on = new Map<SessionId, { variant: VariantId; files: RepoPath[] }>()
    for (const path of target.files) {
      const claim = claims.get(path)
      if (claim === undefined) continue
      const hold = on.get(claim.session) ?? { variant: claim.variant, files: [] }
      hold.files.push(path)
      on.set(claim.session, hold)
    }
    if (on.size > 0) {
      const holds = [...on].map(([holder, { variant, files }]) => ({
        session: holder,
        variant,
        files,
      }))
      slots.set(session, { kind: "wait", on: holds })
      continue
    }
    for (const path of target.files) claims.set(path, { session, variant: target.variant })
    slots.set(session, { kind: "show", target })
  }
  return slots
}

interface Settled {
  readonly want: ReadonlyMap<SessionId, Want>
  readonly leases: ReadonlyMap<RepoPath, Lease>
  /** The content each path a layer left or entered ends with. */
  readonly contents: ReadonlyMap<RepoPath, Content>
  readonly places: ReadonlyMap<SessionId, Placed>
}

/**
 * Moves every offered session toward its want in one pass. A layer or want whose session has no
 * offer is forgotten: the session was kept or deleted, so its content stays in place.
 *
 * 1. Rank the wishes and assign files as if nothing were shown.
 * 2. Take out each layer not assigned its own variant again, merge3(live, after, before) per path,
 *    so a designer edit survives. A layer with a conflicting path stays whole and is pinned.
 * 3. Assign again, the layers left in place (kept and pinned) claiming their files first.
 * 4. Put each newly shown target in, merge3(origin, base, commit) per path.
 */
async function settle(
  store: Store,
  now: Journal,
  offers: readonly Offer[],
  closing: SessionId | null,
): Promise<Settled> {
  const opened = new Map(offers.map((offer) => [offer.session, offer.opened]))
  const want = new Map(
    Object.entries(now.want).flatMap(([id, entry]) => {
      const session = SessionId.parse(id)
      return opened.has(session) ? [[session, entry] as const] : []
    }),
  )
  const layers = new Map<SessionId, { variant: VariantId; leases: Map<RepoPath, Lease> }>()
  for (const [path, lease] of Object.entries(now.leases)) {
    if (!opened.has(lease.session)) continue
    const layer = layers.get(lease.session) ?? { variant: lease.variant, leases: new Map() }
    layer.leases.set(RepoPath.parse(path), lease)
    layers.set(lease.session, layer)
  }

  const wishes = offers
    .map(({ session, opened: at, ready }): Wish => {
      const wanted = want.get(session)
      if (wanted === undefined)
        return { session, target: ready[0] ?? null, rank: { by: "auto", at } }
      const target =
        wanted.choice === "original"
          ? null
          : (ready.find((entry) => entry.variant === wanted.choice) ?? null)
      const by = session === closing ? "closing" : wanted.by
      return { session, target, rank: { by, at: wanted.at } }
    })
    .toSorted(byRank)

  const first = assign(wishes, new Map())
  const kept = new Map<SessionId, Layer>()
  const pinned = new Map<SessionId, { layer: Layer; conflicts: RepoPath[] }>()
  const origins = new Map<RepoPath, Content>()
  for (const [session, layer] of layers) {
    const slot = first.get(session)
    if (slot?.kind === "show" && slot.target.variant === layer.variant) {
      kept.set(session, layer)
      continue
    }
    const out: [RepoPath, Content][] = []
    const conflicts: RepoPath[] = []
    for (const [path, lease] of layer.leases) {
      const origin = await merge3(store, await store.live(path), lease.after, lease.before)
      if (origin === CONFLICT) conflicts.push(path)
      else out.push([path, origin])
    }
    if (conflicts.length > 0) pinned.set(session, { layer, conflicts })
    else for (const [path, origin] of out) origins.set(path, origin)
  }

  const held = new Map<SessionId, Layer>(kept)
  for (const [session, { layer }] of pinned) held.set(session, layer)
  const final = assign(wishes, held)
  const leases = new Map<RepoPath, Lease>()
  for (const layer of held.values())
    for (const [path, lease] of layer.leases) leases.set(path, lease)
  const contents = new Map(origins)
  const places = new Map<SessionId, Placed>()

  for (const { session } of wishes) {
    const stuck = pinned.get(session)
    if (stuck !== undefined) {
      const { conflicts: files, layer } = stuck
      places.set(session, { kind: "conflict", files, showing: layer.variant })
      continue
    }
    const layer = kept.get(session)
    if (layer !== undefined) {
      places.set(session, { kind: "shown", variant: layer.variant })
      continue
    }
    const slot = final.get(session)
    if (slot === undefined || slot.kind === "original") {
      places.set(session, { kind: "original" })
      continue
    }
    if (slot.kind === "wait") {
      places.set(session, { kind: "waiting", on: slot.on })
      continue
    }
    const { target } = slot
    const put: [RepoPath, Lease][] = []
    const conflicts: RepoPath[] = []
    for (const path of target.files) {
      const origin = origins.has(path) ? (origins.get(path) ?? null) : await store.live(path)
      const next = await merge3(
        store,
        origin,
        await store.at(target.base, path),
        await store.at(target.commit, path),
      )
      if (next === CONFLICT) conflicts.push(path)
      else put.push([path, { session, variant: target.variant, before: origin, after: next }])
    }
    if (conflicts.length > 0) {
      places.set(session, { kind: "conflict", files: conflicts, showing: null })
      continue
    }
    for (const [path, lease] of put) {
      leases.set(path, lease)
      contents.set(path, lease.after)
    }
    places.set(session, { kind: "shown", variant: target.variant })
    // An auto want is fixed once it shows, so a variant that turns ready later never flips it.
    const at = opened.get(session)
    if (!want.has(session) && at !== undefined)
      want.set(session, { choice: target.variant, by: "auto", at })
  }
  return { want, leases, contents, places }
}

/** The store with `contents` written over its working tree, for a second pass in one plan. */
const overlay = (store: Store, contents: ReadonlyMap<RepoPath, Content>): Store => ({
  live: async (path) => (contents.has(path) ? (contents.get(path) ?? null) : store.live(path)),
  at: (commit, path) => store.at(commit, path),
  merge3: (ours, base, theirs) => store.merge3(ours, base, theirs),
})

const record = <K extends string, V>(entries: Iterable<[K, V]>): Record<K, V> =>
  // SAFETY: every key comes from `entries`, whose keys are K.
  Object.fromEntries([...entries].toSorted(([a], [b]) => compare(a, b))) as Record<K, V>

const journalOf = (now: Journal, seq: Seq, settled: Settled): Journal => ({
  ...now,
  seq,
  want: record(settled.want),
  leases: record(settled.leases),
})

/**
 * Moves the journal toward the wants after `request` edits them. Pure over `store`: nothing is
 * written here, and planning again on the result plans no writes. Only `keep` and `discard`
 * refuse; `show` records the want and reports where the session ended up instead.
 */
export async function plan(
  store: Store,
  now: Journal,
  offers: readonly Offer[],
  request: Request,
): Promise<Plan> {
  if (request.kind === "keep") {
    const shows = Object.values(now.leases).find((lease) => lease.session === request.session)
    const offer = offers.find((entry) => entry.session === request.session)
    const wants = now.want[request.session]?.choice ?? offer?.ready[0]?.variant
    if (shows?.variant !== request.variant && wants !== request.variant)
      return { ok: false, refusal: { kind: "not-shown", variant: request.variant } }
  }

  let edited = now
  if (request.kind !== "settle") {
    const seq = Seq.parse(now.seq + 1)
    const choice =
      request.kind === "show"
        ? request.choice
        : request.kind === "keep"
          ? request.variant
          : "original"
    const want = { ...now.want, [request.session]: { choice, by: "designer", at: seq } as const }
    edited = { ...now, seq, want }
  }

  const closing = request.kind === "keep" ? request.session : null
  const first = await settle(store, edited, offers, closing)
  let settled = first
  const place = request.kind === "settle" ? undefined : first.places.get(request.session)
  if (request.kind !== "show" && place?.kind === "conflict")
    return { ok: false, refusal: { kind: "conflict", files: place.files } }
  if (request.kind === "keep") {
    if (place?.kind === "waiting") return { ok: false, refusal: { kind: "held", on: place.on } }
    // The kept layer becomes code: its leases go, its files stay. The session wants the original
    // from here, so a crash before it is dropped never shows its variant again.
    const leases = new Map(
      [...first.leases].filter(([, lease]) => lease.session !== request.session),
    )
    const want = new Map(first.want).set(request.session, {
      choice: "original",
      by: "designer",
      at: edited.seq,
    })
    const released = journalOf(edited, edited.seq, { ...first, want, leases })
    const again = await settle(overlay(store, first.contents), released, offers, null)
    settled = { ...again, contents: new Map([...first.contents, ...again.contents]) }
  }

  const writes: FileWrite[] = []
  for (const [path, write] of [...settled.contents].toSorted(([a], [b]) => compare(a, b))) {
    const live = await store.live(path)
    if (write !== live) writes.push({ path, expect: live, write })
  }
  const written = new Set(writes.map((write) => write.path))
  const journal: Journal = {
    ...journalOf(edited, edited.seq, settled),
    stuck: now.stuck.filter((path) => !written.has(path)),
    moving: writes.length > 0 ? writes : null,
  }
  return { ok: true, journal, writes, places: settled.places }
}
