import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  BlobId,
  CommitId,
  EMPTY_JOURNAL,
  type Journal,
  RepoPath,
  Seq,
  SessionId,
  type Target,
  type VariantId,
} from "./model"
import { type Offer, plan, type Request, type Store } from "./swap"

type Tree = Record<string, string>

const lines = (count: number, label = "line") =>
  Array.from({ length: count }, (_, index) => `${label} ${index + 1}\n`).join("")

const edit = (text: string, line: number, to: string) =>
  text
    .split("\n")
    .map((current, index) => (index === line - 1 ? to : current))
    .join("\n")

/** Content-addressed blobs and commits in memory; merges go through `git merge-file`. */
class MemoryStore implements Store {
  readonly blobs = new Map<BlobId, string>()
  readonly tree: Map<RepoPath, BlobId>
  private readonly commits = new Map<CommitId, Map<RepoPath, BlobId>>()

  constructor(files: Tree) {
    this.tree = this.paths(files)
  }

  blob(text: string): BlobId {
    const id = BlobId.parse(createHash("sha1").update(text).digest("hex"))
    this.blobs.set(id, text)
    return id
  }

  commit(files: Tree): CommitId {
    const id = CommitId.parse(createHash("sha1").update(JSON.stringify(files)).digest("hex"))
    this.commits.set(id, this.paths(files))
    return id
  }

  /** The live tree as text, path order. */
  read(): Tree {
    return Object.fromEntries(
      [...this.tree]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([path, id]) => [path, this.blobs.get(id) ?? ""]),
    )
  }

  type(path: string, text: string | null) {
    const at = RepoPath.parse(path)
    if (text === null) this.tree.delete(at)
    else this.tree.set(at, this.blob(text))
  }

  async live(path: RepoPath) {
    return this.tree.get(path) ?? null
  }

  async at(commit: CommitId, path: RepoPath) {
    return this.commits.get(commit)?.get(path) ?? null
  }

  async merge3(ours: BlobId, base: BlobId, theirs: BlobId) {
    const dir = mkdtempSync(join(tmpdir(), "morph-merge-"))
    try {
      const [o, b, t] = [ours, base, theirs].map((id, index) => {
        const file = join(dir, String(index))
        writeFileSync(file, this.blobs.get(id) ?? "")
        return file
      }) as [string, string, string]
      execFileSync("git", ["merge-file", "-q", o, b, t])
      return this.blob(readFileSync(o, "utf8"))
    } catch {
      return null
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  private paths(files: Tree) {
    return new Map(
      Object.entries(files).map(([path, text]) => [RepoPath.parse(path), this.blob(text)]),
    )
  }
}

const BASE: Tree = {
  "a.tsx": lines(10),
  "b.tsx": lines(10, "b"),
  "c.tsx": lines(3, "c"),
  "page.tsx": lines(10, "page"),
}

const id = () => SessionId.parse(randomUUID())

function variant(
  store: MemoryStore,
  session: SessionId,
  variant: VariantId,
  edits: Record<string, string | null>,
  base: Tree = BASE,
): Target {
  const files = Object.fromEntries(
    Object.entries({ ...base, ...edits }).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  )
  return {
    session,
    variant,
    base: store.commit(base),
    commit: store.commit(files),
    files: Object.keys(edits).map((path) => RepoPath.parse(path)),
  }
}

const offer = (session: SessionId, opened: number, ...ready: Target[]): Offer => ({
  session,
  opened: Seq.parse(opened),
  ready,
})

/** A page under test: plans each request and writes its result into the store. */
function page(store: MemoryStore, offers: Offer[]) {
  let journal: Journal = EMPTY_JOURNAL
  const run = async (request: Request) => {
    const planned = await plan(store, journal, offers, request)
    if (!planned.ok) return planned
    for (const { path, write } of planned.writes) store.type(path, write && store.blobs.get(write)!)
    journal = { ...planned.journal, moving: null }
    return planned
  }
  return {
    offers,
    journal: () => journal,
    run,
    async places() {
      const settled = await run({ kind: "settle" })
      if (!settled.ok) throw new Error("a settle refused")
      return Object.fromEntries(settled.places)
    },
  }
}

describe("plan with one session", () => {
  it("writes nothing when the shown variant is shown again or the page is settled", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "A") })
    const tab = page(store, [offer(s, 1, a)])
    await tab.run({ kind: "show", session: s, choice: "v1" })

    const again = await tab.run({ kind: "show", session: s, choice: "v1" })
    const settled = await plan(store, tab.journal(), tab.offers, { kind: "settle" })

    expect(again).toMatchObject({ ok: true, writes: [] })
    expect(settled).toMatchObject({ ok: true, writes: [], journal: tab.journal() })
  })

  it("restores every file byte for byte after show v1, show v2, discard", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "A"),
      "b.tsx": edit(BASE["b.tsx"]!, 5, "A"),
    })
    const b = variant(store, s, "v2", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "B"),
      "c.tsx": edit(BASE["c.tsx"]!, 1, "B"),
    })
    const tab = page(store, [offer(s, 1, a, b)])

    await tab.run({ kind: "show", session: s, choice: "v1" })
    expect(store.read()["b.tsx"]).toContain("A\n")
    await tab.run({ kind: "show", session: s, choice: "v2" })
    expect(store.read()).toEqual({
      ...BASE,
      "a.tsx": edit(BASE["a.tsx"]!, 2, "B"),
      "c.tsx": edit(BASE["c.tsx"]!, 1, "B"),
    })
    const discarded = await tab.run({ kind: "discard", session: s })

    expect(discarded.ok && discarded.journal.leases).toEqual({})
    expect(store.read()).toEqual(BASE)
  })

  it("keeps a designer edit outside the variant's hunks through show, swap and discard", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "A") })
    const b = variant(store, s, "v2", { "a.tsx": edit(BASE["a.tsx"]!, 3, "B") })
    const tab = page(store, [offer(s, 1, a, b)])
    store.type("a.tsx", edit(BASE["a.tsx"]!, 9, "mine before"))

    await tab.run({ kind: "show", session: s, choice: "v1" })
    expect(store.read()["a.tsx"]).toBe(edit(edit(BASE["a.tsx"]!, 9, "mine before"), 2, "A"))
    store.type("a.tsx", edit(store.read()["a.tsx"]!, 7, "mine after"))
    await tab.run({ kind: "show", session: s, choice: "v2" })
    await tab.run({ kind: "discard", session: s })

    expect(store.read()["a.tsx"]).toBe(
      edit(edit(BASE["a.tsx"]!, 9, "mine before"), 7, "mine after"),
    )
  })

  it("refuses a discard that overlaps a designer edit, naming the file", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "A"),
      "b.tsx": edit(BASE["b.tsx"]!, 2, "A"),
    })
    const tab = page(store, [offer(s, 1, a)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    store.type("a.tsx", edit(store.read()["a.tsx"]!, 2, "mine"))
    const before = store.read()

    const discard = await tab.run({ kind: "discard", session: s })

    expect(discard).toEqual({ ok: false, refusal: { kind: "conflict", files: ["a.tsx"] } })
    expect(store.read()).toEqual(before)
  })

  it("round-trips a variant that adds and deletes files", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", { "new/notice.tsx": "export {}\n", "c.tsx": null })
    const tab = page(store, [offer(s, 1, a)])

    await tab.run({ kind: "show", session: s, choice: "v1" })
    expect(Object.keys(store.read())).toEqual(["a.tsx", "b.tsx", "new/notice.tsx", "page.tsx"])
    await tab.run({ kind: "discard", session: s })

    expect(store.read()).toEqual(BASE)
  })

  it("shows the first ready variant on its own and stays on it when another turns ready", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const v1 = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "one") })
    const v2 = variant(store, s, "v2", { "a.tsx": edit(BASE["a.tsx"]!, 2, "two") })
    const tab = page(store, [offer(s, 1, v2)])

    expect(await tab.places()).toEqual({ [s]: { kind: "shown", variant: "v2" } })
    tab.offers[0] = offer(s, 1, v1, v2)

    expect(await tab.places()).toEqual({ [s]: { kind: "shown", variant: "v2" } })
    expect(store.read()["a.tsx"]).toBe(edit(BASE["a.tsx"]!, 2, "two"))
  })
})

describe("plan with several sessions", () => {
  it("shows two sessions whose files are disjoint at once", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const a = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "S") })
    const b = variant(store, t, "v1", { "b.tsx": edit(BASE["b.tsx"]!, 2, "T") })
    const tab = page(store, [offer(s, 1, a), offer(t, 2, b)])

    await tab.run({ kind: "show", session: s, choice: "v1" })
    await tab.run({ kind: "show", session: t, choice: "v1" })

    expect(await tab.places()).toEqual({
      [s]: { kind: "shown", variant: "v1" },
      [t]: { kind: "shown", variant: "v1" },
    })
    expect(store.read()).toEqual({
      ...BASE,
      "a.tsx": edit(BASE["a.tsx"]!, 2, "S"),
      "b.tsx": edit(BASE["b.tsx"]!, 2, "T"),
    })
  })

  it("gives shared files to the newest flip, and gives them back when it is discarded", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", {
      "page.tsx": edit(BASE["page.tsx"]!, 2, "header"),
      "a.tsx": edit(BASE["a.tsx"]!, 2, "header"),
    })
    const card = variant(store, t, "v2", {
      "page.tsx": edit(BASE["page.tsx"]!, 8, "card"),
      "b.tsx": edit(BASE["b.tsx"]!, 2, "card"),
    })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: s, choice: "v1" })

    const taken = await tab.run({ kind: "show", session: t, choice: "v2" })

    expect(taken.ok && Object.fromEntries(taken.places)).toEqual({
      [s]: {
        kind: "waiting",
        variant: "v1",
        on: [{ session: t, variant: "v2", files: ["page.tsx"] }],
      },
      [t]: { kind: "shown", variant: "v2" },
    })
    expect(store.read()).toEqual({
      ...BASE,
      "page.tsx": edit(BASE["page.tsx"]!, 8, "card"),
      "b.tsx": edit(BASE["b.tsx"]!, 2, "card"),
    })

    await tab.run({ kind: "discard", session: t })
    tab.offers.pop()

    expect(await tab.places()).toEqual({ [s]: { kind: "shown", variant: "v1" } })
    expect(store.read()).toEqual({
      ...BASE,
      "page.tsx": edit(BASE["page.tsx"]!, 2, "header"),
      "a.tsx": edit(BASE["a.tsx"]!, 2, "header"),
    })
  })

  it("takes the files back when the waiting session is flipped again", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 2, "header") })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    await tab.run({ kind: "show", session: t, choice: "v1" })

    await tab.run({ kind: "show", session: s, choice: "v1" })

    expect(await tab.places()).toEqual({
      [s]: { kind: "shown", variant: "v1" },
      [t]: {
        kind: "waiting",
        variant: "v1",
        on: [{ session: s, variant: "v1", files: ["page.tsx"] }],
      },
    })
    expect(store.read()["page.tsx"]).toBe(edit(BASE["page.tsx"]!, 2, "header"))
  })

  it("never lets a variant shown on its own displace a designer's choice", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 2, "header") })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    tab.offers.push(offer(t, 2, card))

    expect(await tab.places()).toEqual({
      [s]: { kind: "shown", variant: "v1" },
      [t]: {
        kind: "waiting",
        variant: "v1",
        on: [{ session: s, variant: "v1", files: ["page.tsx"] }],
      },
    })
  })

  it("keeps the holder and brings the waiting session back merged onto the kept code", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 2, "header") })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: t, choice: "v1" })
    await tab.run({ kind: "show", session: s, choice: "v1" })

    const kept = await tab.run({ kind: "keep", session: s, variant: "v1" })

    expect(kept.ok && kept.places.get(t)).toEqual({ kind: "shown", variant: "v1" })
    expect(store.read()["page.tsx"]).toBe(edit(edit(BASE["page.tsx"]!, 2, "header"), 8, "card"))
    tab.offers.shift()
    await tab.run({ kind: "discard", session: t })
    expect(store.read()["page.tsx"]).toBe(edit(BASE["page.tsx"]!, 2, "header"))
  })

  it("keeps a waiting session by taking its files over, and the displaced one comes back on the kept code", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", {
      "page.tsx": edit(BASE["page.tsx"]!, 2, "header"),
      "a.tsx": edit(BASE["a.tsx"]!, 2, "header"),
    })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    await tab.run({ kind: "show", session: t, choice: "v1" })
    expect((await tab.places())[s]).toMatchObject({ kind: "waiting" })

    const kept = await tab.run({ kind: "keep", session: s, variant: "v1" })

    expect(kept.ok && kept.journal.leases).toEqual({
      "page.tsx": expect.objectContaining({ session: t, variant: "v1" }),
    })
    expect(store.read()).toEqual({
      ...BASE,
      "a.tsx": edit(BASE["a.tsx"]!, 2, "header"),
      "page.tsx": edit(edit(BASE["page.tsx"]!, 2, "header"), 8, "card"),
    })
  })

  it("refuses a keep that names a variant the session neither shows nor waits for", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const v1 = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "one") })
    const v2 = variant(store, s, "v2", { "a.tsx": edit(BASE["a.tsx"]!, 2, "two") })
    const tab = page(store, [offer(s, 1, v1, v2)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    const before = tab.journal()

    const kept = await tab.run({ kind: "keep", session: s, variant: "v2" })

    expect(kept).toEqual({ ok: false, refusal: { kind: "not-shown", variant: "v2" } })
    expect(tab.journal()).toBe(before)
    expect(store.read()["a.tsx"]).toBe(edit(BASE["a.tsx"]!, 2, "one"))
  })

  it("keeps a designer's hand edit on a shown file through a takeover and a return", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 2, "header") })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    store.type("page.tsx", edit(store.read()["page.tsx"]!, 5, "mine"))

    await tab.run({ kind: "show", session: t, choice: "v1" })
    expect(store.read()["page.tsx"]).toBe(edit(edit(BASE["page.tsx"]!, 5, "mine"), 8, "card"))
    await tab.run({ kind: "discard", session: t })
    tab.offers.pop()

    expect(await tab.places()).toEqual({ [s]: { kind: "shown", variant: "v1" } })
    expect(store.read()["page.tsx"]).toBe(edit(edit(BASE["page.tsx"]!, 5, "mine"), 2, "header"))
  })

  it("pins a layer that cannot come out, and the session that wanted its files waits on it", async () => {
    const store = new MemoryStore(BASE)
    const [s, t] = [id(), id()]
    const header = variant(store, s, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 2, "header") })
    const card = variant(store, t, "v1", { "page.tsx": edit(BASE["page.tsx"]!, 8, "card") })
    const tab = page(store, [offer(s, 1, header), offer(t, 2, card)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    store.type("page.tsx", edit(store.read()["page.tsx"]!, 2, "mine"))
    const before = store.read()

    const taken = await tab.run({ kind: "show", session: t, choice: "v1" })

    expect(taken).toMatchObject({ ok: true, writes: [] })
    expect(taken.ok && Object.fromEntries(taken.places)).toEqual({
      [s]: { kind: "conflict", want: "v1", files: ["page.tsx"], showing: "v1" },
      [t]: {
        kind: "waiting",
        variant: "v1",
        on: [{ session: s, variant: "v1", files: ["page.tsx"] }],
      },
    })
    expect(store.read()).toEqual(before)
  })

  it("forgets the layer of a session that is gone and leaves its files in place", async () => {
    const store = new MemoryStore(BASE)
    const s = id()
    const a = variant(store, s, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "A") })
    const tab = page(store, [offer(s, 1, a)])
    await tab.run({ kind: "show", session: s, choice: "v1" })
    tab.offers.pop()

    const settled = await tab.run({ kind: "settle" })

    expect(settled).toMatchObject({ ok: true, writes: [], journal: { want: {}, leases: {} } })
    expect(store.read()["a.tsx"]).toBe(edit(BASE["a.tsx"]!, 2, "A"))
  })
})
