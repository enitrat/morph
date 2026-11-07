import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  type Applied,
  BlobId,
  CommitId,
  RepoPath,
  SessionId,
  type Target,
  type VariantId,
} from "./model"
import { planSwap, type Store } from "./swap"

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
    const dir = mkdtempSync(join(tmpdir(), "tune-merge-"))
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

const SESSION = SessionId.parse(randomUUID())

function variant(
  store: MemoryStore,
  base: Tree,
  id: VariantId,
  edits: Record<string, string | null>,
) {
  const files = Object.fromEntries(
    Object.entries({ ...base, ...edits }).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  )
  return {
    session: SESSION,
    variant: id,
    base: store.commit(base),
    commit: store.commit(files),
    files: Object.keys(edits).map((path) => RepoPath.parse(path)),
  } satisfies Target
}

/** Plans the swap and writes it into the store. */
async function swap(store: MemoryStore, now: Applied | null, target: Target | null) {
  const plan = await planSwap(store, now, target)
  if (!plan.ok) throw new Error(`conflicts: ${plan.conflicts.join(", ")}`)
  for (const { path, write } of plan.writes) store.type(path, write && store.blobs.get(write)!)
  return plan
}

const BASE: Tree = { "a.tsx": lines(10), "b.tsx": lines(10, "b"), "c.tsx": lines(3, "c") }

describe("planSwap", () => {
  it("writes nothing when the shown variant is shown again", async () => {
    const store = new MemoryStore(BASE)
    const a = variant(store, BASE, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "A") })
    const shown = await swap(store, null, a)

    const again = await planSwap(store, shown.to, a)

    expect(again).toEqual({ ok: true, to: shown.to, writes: [] })
  })

  it("restores every file byte for byte after show A, show B, discard", async () => {
    const store = new MemoryStore(BASE)
    const a = variant(store, BASE, "v1", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "A"),
      "b.tsx": edit(BASE["b.tsx"]!, 5, "A"),
    })
    const b = variant(store, BASE, "v2", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "B"),
      "c.tsx": edit(BASE["c.tsx"]!, 1, "B"),
    })

    const showingA = await swap(store, null, a)
    expect(store.read()["b.tsx"]).toContain("A\n")
    const showingB = await swap(store, showingA.to, b)
    expect(store.read()).toEqual({
      ...BASE,
      "a.tsx": edit(BASE["a.tsx"]!, 2, "B"),
      "c.tsx": edit(BASE["c.tsx"]!, 1, "B"),
    })
    const discarded = await swap(store, showingB.to, null)

    expect(discarded.to).toBeNull()
    expect(store.read()).toEqual(BASE)
  })

  it("keeps a designer edit outside the variant's hunks through show, swap and discard", async () => {
    const store = new MemoryStore(BASE)
    const a = variant(store, BASE, "v1", { "a.tsx": edit(BASE["a.tsx"]!, 2, "A") })
    const b = variant(store, BASE, "v2", { "a.tsx": edit(BASE["a.tsx"]!, 3, "B") })
    store.type("a.tsx", edit(BASE["a.tsx"]!, 9, "mine before"))

    const showingA = await swap(store, null, a)
    expect(store.read()["a.tsx"]).toBe(edit(edit(BASE["a.tsx"]!, 9, "mine before"), 2, "A"))
    store.type("a.tsx", edit(store.read()["a.tsx"]!, 7, "mine after"))
    const showingB = await swap(store, showingA.to, b)
    await swap(store, showingB.to, null)

    expect(store.read()["a.tsx"]).toBe(
      edit(edit(BASE["a.tsx"]!, 9, "mine before"), 7, "mine after"),
    )
  })

  it("refuses a discard that overlaps a designer edit, naming the file", async () => {
    const store = new MemoryStore(BASE)
    const a = variant(store, BASE, "v1", {
      "a.tsx": edit(BASE["a.tsx"]!, 2, "A"),
      "b.tsx": edit(BASE["b.tsx"]!, 2, "A"),
    })
    const showingA = await swap(store, null, a)
    store.type("a.tsx", edit(store.read()["a.tsx"]!, 2, "mine"))
    const before = store.read()

    const discard = await planSwap(store, showingA.to, null)

    expect(discard).toEqual({ ok: false, conflicts: ["a.tsx"] })
    expect(store.read()).toEqual(before)
  })

  it("round-trips a variant that adds and deletes files", async () => {
    const store = new MemoryStore(BASE)
    const a = variant(store, BASE, "v1", { "new/notice.tsx": "export {}\n", "c.tsx": null })

    const showingA = await swap(store, null, a)
    expect(Object.keys(store.read())).toEqual(["a.tsx", "b.tsx", "new/notice.tsx"])
    await swap(store, showingA.to, null)

    expect(store.read()).toEqual(BASE)
  })
})
