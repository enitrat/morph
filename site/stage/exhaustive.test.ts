import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type AskNode, type FileNode, manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage } from "./stage"
import { type Operation, operations, SessionId, type VariantId } from "./wire"

// Skip the demo transport's cosmetic write delay; job progress uses the clock supplied below.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const VARIANTS: readonly VariantId[] = ["v1", "v2", "v3"]

/** A fresh stage and transport per run; the transport parses every success with the overlay's schema. */
function replay() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown, query = new URLSearchParams()) => {
    const pending = transport({ op, query, body })
    await vi.runAllTimersAsync()
    const reply = await pending
    if (reply.status !== 200) throw new Error(`${op}: ${JSON.stringify(reply.body)}`)
    return reply.body
  }
  const target = (file: FileNode) => [
    { source: { path: file.path, line: 1, col: 1 }, owner: [file.name], text: "" },
  ]
  /** Asks `ask` at `file`, lets all three variants land, and returns the session. */
  const land = async (file: FileNode, ask: AskNode) => {
    const id = SessionId.parse(crypto.randomUUID())
    await call("ask", { id, words: ask.words, targets: target(file) })
    now += 1499
    const early = operations.page.response.parse(await call("page"))
    expect(
      early.sessions
        .filter((view) => view.kind === "active")
        .find((entry) => entry.id === id)
        ?.variants.map((v) => v.state),
    ).toEqual(["pending", "pending", "pending"])
    now += 3501
    const view = operations.page.response.parse(await call("page"))
    const session = view.sessions.find((entry) => entry.id === id)
    if (session?.kind !== "active") throw new Error("No active session")
    expect(session.variants.map((variant) => variant.state)).toEqual(["ready", "ready", "ready"])
    for (const variant of session?.variants ?? [])
      if (variant.state === "ready") expect(variant.title.length).toBeLessThanOrEqual(36)
    return id
  }
  return { stage, call, land, target }
}

/** Where an ask is picked: the file itself, or a scene's entry for a stylesheet. */
const pickedAt = (file: FileNode) =>
  file.kind === "style" ? (manifest.files.get(file.scene.entry) as FileNode) : file

const recorded = [...manifest.files.values()].flatMap((file) =>
  file.original.asks.map((ask) => ({ file, ask })),
)

describe("every recorded ask", () => {
  it.each(recorded.map(({ file, ask }) => [`${file.name}: ${ask.words}`, file, ask] as const))(
    "%s: asks, flips each variant, keeps each, and refines one step",
    async (_, file, ask) => {
      for (const variant of VARIANTS) {
        const { stage, call, land } = replay()
        const id = await land(pickedAt(file), ask)
        for (const choice of [...VARIANTS, "original" as const, variant]) {
          operations.show.response.parse(await call("show", { id, variant: choice }))
          const expected =
            choice === "original" ? file.original : ask.variants[VARIANTS.indexOf(choice)]?.revision
          expect(stage.snapshot().shown.get(file.path)?.key).toBe(expected?.key)
        }
        operations.keep.response.parse(await call("keep", { id, variant }))
        const kept = stage.snapshot().kept.get(file.path)
        expect(kept?.key).toBe(ask.variants[VARIANTS.indexOf(variant)]?.revision.key)

        // A keep must not strand the visitor: other recorded asks stay reachable through suggestions.
        for (const other of recorded.filter((entry) => entry.ask !== ask)) {
          const reply = await call(
            "suggest",
            undefined,
            new URLSearchParams({ path: pickedAt(other.file).path }),
          )
          const words = operations.suggest.response
            .parse(reply)
            .suggestions.map((entry) => entry.words)
          expect(words).toContain(other.ask.words)
        }

        for (const refine of kept?.asks ?? []) {
          const { stage: again, call: callAgain, land: landAgain, target } = replay()
          const from = await landAgain(pickedAt(file), ask)
          await callAgain("show", { id: from, variant })
          const next = SessionId.parse(crypto.randomUUID())
          operations.refine.response.parse(
            await callAgain("refine", {
              from,
              variant,
              ask: {
                id: next,
                words: refine.words,
                targets: target(pickedAt(file)),
                marks: [],
                count: 3,
              },
            }),
          )
          expect(again.snapshot().sessions.map((session) => session.ask)).toEqual([refine])
        }
      }
    },
  )
})
