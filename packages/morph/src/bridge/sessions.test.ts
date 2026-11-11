import { waitForSession } from "./test-fixtures"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { Anchor, type Ask, SessionId, VariantId } from "../variant/model"
import { readCheckpoint } from "./checkpoint"
import { writeJson } from "./disk"
import { changedFiles, commitTree, homeOf, type Host, snapshot } from "./git"
import { ask, discard, keep, page, readSession, refine, show } from "./session"
import {
  closeFixtureWorkers,
  completeVariant,
  openHost,
  seedSession,
  SPAWNING_TEST_MS,
} from "./test-fixtures"

import { slotsRoot } from "./slots"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

const lines = (label: string) =>
  Array.from({ length: 8 }, (_, index) => `${label} ${index + 1}\n`).join("")
const edit = (text: string, line: number, to: string) =>
  text
    .split("\n")
    .map((current, index) => (index === line - 1 ? to : current))
    .join("\n")

const BASE = {
  "app/page.tsx": lines("page"),
  "src/header.tsx": lines("header"),
  "src/card.tsx": lines("card"),
}
type Path = keyof typeof BASE

const dirs: string[] = []
const hosts: Host[] = []
const originalPath = process.env.PATH
afterEach(async () => {
  for (const repo of hosts.splice(0)) {
    await closeFixtureWorkers(repo)
    rmSync(await slotsRoot(repo), { recursive: true, force: true })
  }
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "morph-sessions-")))
  dirs.push(dir)
  return dir
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

const ANCHOR = Anchor.parse({
  source: { path: "app/page.tsx", line: 1, col: 1 },
  owner: ["Page"],
  text: "",
})
const { signal } = new AbortController()

/** A repo with a fake `claude` on PATH that logs when each planner run starts and ends. */
async function fixture() {
  const root = temp()
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "morph@example.com")
  sh(root, "config", "user.name", "Morph")
  write(root, BASE)
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  const bin = temp()
  const planned = {
    type: "result",
    is_error: false,
    structured_output: {
      directions: [1, 2, 3].map((n) => ({ title: `Direction ${n}`, description: "Does it." })),
    },
  }
  const claude = join(bin, "claude")
  writeFileSync(
    claude,
    `#!/bin/sh
cat > /dev/null
case "$*" in *Read,Edit*) exit 1;; esac
bin=$(dirname "$0")
echo start >> "$bin/calls"
if [ -f "$bin/slow" ]; then sleep 1; fi
echo end >> "$bin/calls"
echo '${JSON.stringify(planned)}'
`,
  )
  chmodSync(claude, 0o755)
  process.env.PATH = `${bin}:${originalPath ?? ""}`
  const repo = await openHost(root)
  hosts.push(repo)
  return { root, repo, bin, ...helpers(root, repo) }
}

function helpers(root: string, repo: Host) {
  return {
    /** Opens a session whose jobs never run: each variant already failed, until `ready`. */
    async open(words = "change it") {
      const id = SessionId.parse(randomUUID())
      const request: Ask = { id, words, targets: [ANCHOR], marks: [], count: 3 }
      await seedSession(repo, request)
      return id
    },

    /** Finishes `variant` the way a runner does: edits a worktree of the base and commits it. */
    async ready(id: SessionId, variant: VariantId, edits: Partial<Record<Path, string>>) {
      const session = await readSession(repo, id)
      if (session === null) throw new Error("no session")
      const slot = join(temp(), "slot")
      sh(root, "worktree", "add", "--quiet", "--detach", slot, session.base)
      write(slot, edits)
      const commit = await commitTree(slot, session.base, variant)
      await completeVariant(repo, id, variant, {
        kind: "ready",
        commit,
        title: `${variant} title`,
        summary: "Done.",
        files: await changedFiles(repo, session.base, commit),
        stat: { add: 1, del: 1 },
        ms: { agent: 0, checks: 0, total: 0 },
      })
    },

    read: (path: Path) => readFileSync(join(root, path), "utf8"),

    async places() {
      const answer = await page(repo)
      if (!answer.ok) throw new Error("the page refused")
      return Object.fromEntries(
        answer.value.sessions
          .filter((view) => view.kind === "active")
          .map(({ id, place }) => [id, place]),
      )
    },
  }
}

describe("several sessions", () => {
  it("orders concurrent page observations and continues the sequence after reopening the checkout", async () => {
    const { root, repo, open } = await fixture()
    const id = await open()
    const answers = await Promise.all([page(repo), page(repo), page(repo)])
    const observations = answers.map((answer) => {
      if (!answer.ok) throw new Error(`Page refused: ${JSON.stringify(answer)}`)
      expect(answer.value.sessions.map((session) => session.id)).toEqual([id])
      return answer.value.observation
    })
    expect(new Set(observations).size).toBe(3)
    const next = await page(await openHost(root))
    if (!next.ok) throw new Error(`Page refused: ${JSON.stringify(next)}`)
    expect(next.value.observation).toBeGreaterThan(Math.max(...observations))
  })

  it("plans two asks at once", async () => {
    const { repo, bin } = await fixture()
    writeFileSync(join(bin, "slow"), "")

    const first = SessionId.parse(randomUUID())
    const second = SessionId.parse(randomUUID())
    await Promise.all(
      [first, second].map((id) =>
        ask(repo, { id, words: "change it", targets: [ANCHOR], marks: [], count: 3 }),
      ),
    )

    await Promise.all([first, second].map((id) => waitForSession(repo, id)))
    expect(readFileSync(join(bin, "calls"), "utf8").split("\n")).toEqual([
      "start",
      "start",
      "end",
      "end",
      "",
    ])
    const answer = await page(repo)
    expect(answer.ok && answer.value.sessions.map(({ id }) => id).toSorted()).toEqual(
      [first, second].toSorted(),
    )
  })

  it("shows two sessions whose files are disjoint at once", async () => {
    const { open, ready, read, places } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header") })
    await ready(card, "v1", { "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card") })

    expect(await places()).toEqual({
      [header]: { kind: "shown", variant: "v1", edited: false },
      [card]: { kind: "shown", variant: "v1", edited: false },
    })
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
    expect(read("src/card.tsx")).toBe(edit(BASE["src/card.tsx"], 2, "card"))
  })

  it("gives a shared file to the newest flip and returns it on discard, preserving hand edits", async () => {
    const { root, repo, open, ready, read, places } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header"),
    })
    await show(repo, header, "v1")
    write(root, { "app/page.tsx": read("app/page.tsx") + "mine\n" })
    await ready(card, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 7, "card"),
      "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card"),
    })
    expect((await places())[header]).toMatchObject({ kind: "shown", variant: "v1" })
    expect((await places())[card]).toMatchObject({ kind: "waiting" })

    const taken = await show(repo, card, "v1")

    expect(
      taken.ok &&
        taken.value.sessions.filter((view) => view.kind === "active").map(({ place }) => place),
    ).toEqual([
      {
        kind: "waiting",
        variant: "v1",
        on: [{ session: card, variant: "v1", files: ["app/page.tsx"] }],
      },
      { kind: "shown", variant: "v1", edited: false },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 7, "card") + "mine\n")
    expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])

    await show(repo, header, "v1")
    expect((await places())[card]).toMatchObject({ kind: "waiting" })
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header") + "mine\n")
    await show(repo, card, "v1")

    const discarded = await discard(repo, card)

    expect(discarded.ok && discarded.value.sessions).toMatchObject([
      { id: header, place: { kind: "shown", variant: "v1" } },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header") + "mine\n")
    expect(read("src/card.tsx")).toBe(BASE["src/card.tsx"])
  })

  it("keeps the holder and brings the waiting session back merged onto the kept code, listing the drift", async () => {
    const { repo, open, ready, read } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", { "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header") })
    await ready(card, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 7, "card"),
      "src/card.tsx": edit(BASE["src/card.tsx"], 2, "card"),
    })
    await show(repo, card, "v1")
    await show(repo, header, "v1")

    const kept = await keep(repo, header, "v1")

    expect(kept).toEqual({
      ok: true,
      value: {
        observation: expect.any(Number),
        sessions: [
          expect.objectContaining({
            id: card,
            place: { kind: "shown", variant: "v1", edited: false },
            drift: ["app/page.tsx"],
          }),
        ],
        stuck: [],
      },
    })
    expect(read("app/page.tsx")).toBe(edit(edit(BASE["app/page.tsx"], 2, "header"), 7, "card"))
    await discard(repo, card)
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header"))
  })

  it("keeps a waiting session by taking its files over", async () => {
    const { repo, open, ready, read, places } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "header"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header"),
    })
    await ready(card, "v1", { "app/page.tsx": edit(BASE["app/page.tsx"], 2, "card") })
    await show(repo, header, "v1")
    await show(repo, card, "v1")
    expect((await places())[header]).toMatchObject({ kind: "waiting" })

    const kept = await keep(repo, header, "v1")

    expect(kept.ok && kept.value.sessions).toMatchObject([
      { id: card, place: { kind: "conflict", want: "v1", files: ["app/page.tsx"], showing: null } },
    ])
    expect(read("app/page.tsx")).toBe(edit(BASE["app/page.tsx"], 2, "header"))
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
  })

  it("refuses a keep that names a variant the session does not show", async () => {
    const { repo, open, ready, read, places } = await fixture()
    const header = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "one") })
    await ready(header, "v2", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "two") })
    await show(repo, header, "v1")

    expect(await keep(repo, header, "v2")).toEqual({
      ok: false,
      kind: "not-shown",
      variant: "v2",
    })
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "one"))
    expect(await places()).toEqual({ [header]: { kind: "shown", variant: "v1", edited: false } })
  })

  it("bases a new ask on the page without another session's shown variant", async () => {
    const { root, repo, open, ready, read } = await fixture()
    const header = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header") })
    await page(repo)
    expect(read("src/header.tsx")).toBe(edit(BASE["src/header.tsx"], 2, "header"))
    write(root, {
      "src/header.tsx": read("src/header.tsx") + "mine on shown file\n",
      "src/card.tsx": edit(BASE["src/card.tsx"], 5, "mine"),
    })

    const next = await open()

    const base = (await readSession(repo, next))?.base
    expect(sh(root, "show", `${base}:src/header.tsx`)).toBe(
      BASE["src/header.tsx"] + "mine on shown file\n",
    )
    expect(sh(root, "show", `${base}:src/card.tsx`)).toBe(edit(BASE["src/card.tsx"], 5, "mine"))
    expect(read("src/header.tsx")).toBe(
      edit(BASE["src/header.tsx"], 2, "header") + "mine on shown file\n",
    )
  })

  it("uses no per-session lock for a repost, keep, or discard", async () => {
    const { repo, open, ready } = await fixture()
    const header = await open()
    const card = await open()
    await ready(header, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "header") })
    const lock = (id: SessionId) => join(homeOf(repo), "locks", `session-${id}`)
    await ask(repo, { id: header, words: "change it", targets: [ANCHOR], marks: [], count: 3 })
    expect(existsSync(lock(header))).toBe(false)

    expect((await keep(repo, header, "v1")).ok).toBe(true)
    expect((await discard(repo, card)).ok).toBe(true)

    expect(existsSync(lock(header))).toBe(false)
    expect(existsSync(lock(card))).toBe(false)
  })
})

describe("durable round closure", () => {
  it("recovers an interrupted keep and never replans a closed ask", async () => {
    const { root, repo, bin, open, ready, read } = await fixture()
    const id = await open("Keep both files")
    await ready(id, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "kept page"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "kept header"),
    })
    chmodSync(join(root, "src"), 0o555)
    try {
      await expect(keep(repo, id, "v1")).rejects.toThrow()
      expect(read("app/page.tsx")).toContain("kept page")
      expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])
      const { value } = await readCheckpoint(repo)
      expect(value.rounds[id]?.kind).toBe("closing")
      expect(value.journal.moving).toHaveLength(2)
    } finally {
      chmodSync(join(root, "src"), 0o755)
    }
    const reopened = await openHost(root)
    expect(await page(reopened)).toMatchObject({ ok: true, value: { sessions: [], stuck: [] } })
    expect(read("src/header.tsx")).toContain("kept header")
    const calls = existsSync(join(bin, "calls")) ? readFileSync(join(bin, "calls"), "utf8") : null
    expect(
      await ask(reopened, { id, words: "Keep both files", targets: [ANCHOR], marks: [], count: 3 }),
    ).toMatchObject({ ok: true, value: { sessions: [] } })
    expect(existsSync(join(bin, "calls")) ? readFileSync(join(bin, "calls"), "utf8") : null).toBe(
      calls,
    )
    expect(await readSession(reopened, id)).toBeNull()
    expect((await readCheckpoint(reopened)).value.rounds[id]).toEqual({
      kind: "closed",
      outcome: { kind: "kept", variant: "v1" },
    })
  })

  it("recovers an interrupted discard while preserving a hand edit", async () => {
    const { root, repo, open, ready, read } = await fixture()
    const id = await open()
    await ready(id, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "shown page"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "shown header"),
    })
    await show(repo, id, "v1")
    write(root, { "app/page.tsx": read("app/page.tsx") + "my edit\n" })
    chmodSync(join(root, "src"), 0o555)
    try {
      await expect(discard(repo, id)).rejects.toThrow()
      expect(read("app/page.tsx")).toBe(BASE["app/page.tsx"] + "my edit\n")
      expect((await readCheckpoint(repo)).value.rounds[id]?.kind).toBe("closing")
    } finally {
      chmodSync(join(root, "src"), 0o755)
    }
    expect(await page(await openHost(root))).toMatchObject({
      ok: true,
      value: { sessions: [], stuck: [] },
    })
    expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])
    expect(read("app/page.tsx")).toBe(BASE["app/page.tsx"] + "my edit\n")
  })

  it("resumes the saved refinement after a partial keep without changing its request", async () => {
    const { root, repo, open, ready, read } = await fixture()
    const from = await open("first round")
    await ready(from, "v1", {
      "app/page.tsx": edit(BASE["app/page.tsx"], 2, "kept page"),
      "src/header.tsx": edit(BASE["src/header.tsx"], 2, "kept header"),
    })
    const id = SessionId.parse(randomUUID())
    const request = {
      from,
      variant: "v1" as const,
      ask: { id, words: "saved refinement", targets: [ANCHOR], marks: [], count: 3 },
    }
    chmodSync(join(root, "src"), 0o555)
    try {
      await expect(refine(repo, request)).rejects.toThrow()
      const { value } = await readCheckpoint(repo)
      expect(value.rounds[from]?.kind).toBe("closing")
      expect(value.rounds[id]).toMatchObject({
        kind: "preparing",
        ask: request.ask,
        parent: { session: from },
      })
      expect(read("app/page.tsx")).toContain("kept page")
      expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])
    } finally {
      chmodSync(join(root, "src"), 0o755)
    }
    const reopened = await openHost(root)
    const resumed = await refine(reopened, {
      ...request,
      ask: { ...request.ask, words: "different repost" },
    })
    expect(resumed).toMatchObject({ ok: true, value: { sessions: [{ id }] } })
    const next = await waitForSession(reopened, id)
    expect(next?.ask.words).toBe("saved refinement")
    expect(next?.parent?.session).toBe(from)
    expect(sh(root, "show", `${next?.base}:src/header.tsx`)).toContain("kept header")
    expect(read("app/page.tsx").match(/kept page/g)).toHaveLength(1)
    await discard(reopened, id)
    expect(await refine(reopened, request)).toMatchObject({
      ok: true,
      value: { sessions: [] },
    })
  })

  it("publishes no successor when refinement keep is refused", async () => {
    const { repo, open, ready } = await fixture()
    const from = await open()
    await ready(from, "v1", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "one") })
    await ready(from, "v2", { "src/header.tsx": edit(BASE["src/header.tsx"], 2, "two") })
    await show(repo, from, "v1")
    const id = SessionId.parse(randomUUID())
    expect(
      await refine(repo, {
        from,
        variant: "v2",
        ask: { id, words: "next", targets: [ANCHOR], marks: [], count: 3 },
      }),
    ).toEqual({ ok: false, kind: "not-shown", variant: "v2" })
    const { value } = await readCheckpoint(repo)
    expect(value.rounds[from]?.kind).toBe("active")
    expect(value.rounds[id]).toBeUndefined()
  })
})

describe("checkpoint migration", () => {
  it("imports active plans and observation order once, exposing unowned jobs as retryable", async () => {
    const { root, repo } = await fixture()
    const id = SessionId.parse(randomUUID())
    const session = {
      id,
      base: await snapshot(repo),
      opened: 1,
      ask: { id, words: "legacy ask", targets: [ANCHOR], count: 1, marks: [] },
      directions: [{ title: "One", description: "Does it." }],
      parent: null,
    }
    const file = join(homeOf(repo), "sessions", id, "session.json")
    await writeJson(file, session)
    await writeJson(join(homeOf(repo), "observation.json"), 41)
    expect(await page(repo)).toMatchObject({
      ok: true,
      value: {
        observation: 42,
        sessions: [
          {
            id,
            thread: id,
            words: "legacy ask",
            targets: [ANCHOR],
            variants: [{ id: "v1", state: "failed", retryable: true }],
          },
        ],
      },
    })
    expect(await readSession(await openHost(root), id)).toEqual(session)
    await writeJson(file, { ...session, ask: { ...session.ask, words: "stale legacy writer" } })
    await writeJson(join(homeOf(repo), "observation.json"), 0)
    expect((await readSession(repo, id))?.ask.words).toBe("legacy ask")
    expect(await page(repo)).toMatchObject({ ok: true, value: { observation: 43 } })
  })

  it.each(["missing", "discarded", "kept"] as const)(
    "requires proof of keep for an orphan parent with a %s predecessor",
    async (outcome) => {
      const { root, repo, ready, read } = await fixture()
      const from = SessionId.parse(randomUUID())
      const id = SessionId.parse(randomUUID())
      const parent = {
        session: from,
        variant: "v1" as const,
        title: "One",
        summary: "Kept.",
        words: "first ask",
        parent: null,
      }
      if (outcome !== "missing")
        await writeJson(join(homeOf(repo), "sessions", from, "session.json"), {
          id: from,
          base: await snapshot(repo),
          opened: 1,
          ask: { id: from, words: "first ask", targets: [ANCHOR], marks: [], count: 1 },
          directions: [{ title: "One", description: "Does it." }],
          parent: null,
        })
      await writeJson(join(homeOf(repo), "sessions", id, "parent.json"), parent)
      for (const variant of VariantId.options)
        await writeJson(join(homeOf(repo), "sessions", id, "jobs", variant, "result.json"), {
          kind: "failed",
          reason: "test fixture",
          retryable: true,
        })
      await page(repo)
      expect((await readCheckpoint(repo)).value.rounds[id]).toEqual({
        kind: "legacy-refinement",
        parent,
      })
      if (outcome !== "missing") {
        await ready(from, "v1", {
          "src/header.tsx": edit(BASE["src/header.tsx"], 2, "kept header"),
        })
        await show(repo, from, "v1")
        if (outcome === "kept") await keep(repo, from, "v1")
        else await discard(repo, from)
      }
      expect(await readSession(repo, id)).toBeNull()
      const request = { id, words: "the missing request", targets: [ANCHOR], marks: [], count: 3 }
      const answer = await refine(await openHost(root), { from, variant: "v1", ask: request })
      if (outcome === "kept") {
        expect(answer).toMatchObject({ ok: true })
        expect(await waitForSession(repo, id)).toMatchObject({ ask: request, parent })
        expect(read("src/header.tsx")).toContain("kept header")
      } else {
        expect(answer).toMatchObject({ ok: false, kind: "invalid" })
        expect((await readCheckpoint(repo)).value.rounds[id]).toEqual({
          kind: "legacy-refinement",
          parent,
        })
        expect(await readSession(repo, id)).toBeNull()
        expect(read("src/header.tsx")).toBe(BASE["src/header.tsx"])
      }
    },
  )
})

it("refuses ambiguous imported branches instead of merging their pins", async () => {
  const { repo } = await fixture()
  const root = SessionId.parse(randomUUID())
  const parent = {
    session: root,
    variant: "v1",
    title: "Kept",
    summary: "Kept root",
    words: "Root",
    parent: null,
  }
  const base = await snapshot(repo)
  for (const id of [SessionId.parse(randomUUID()), SessionId.parse(randomUUID())]) {
    await writeJson(join(homeOf(repo), "sessions", id, "session.json"), {
      id,
      base,
      opened: 1,
      parent,
      ask: { id, words: "Branch", targets: [ANCHOR], count: 1, marks: [] },
      directions: [{ title: "One", description: "Does it." }],
    })
  }
  try {
    await expect(readCheckpoint(repo)).rejects.toThrow("Multiple open rounds share a thread")
  } finally {
    rmSync(join(homeOf(repo), "sessions"), { recursive: true, force: true })
  }
})
