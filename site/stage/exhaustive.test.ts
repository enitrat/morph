import { describe, expect, it } from "vitest"

import { type AskNode, type FileNode, manifest } from "./manifest"
import { replayTransport } from "./replay"
import { createStage, REPLAY_SPEED } from "./stage"
import { type Operation, operations, SessionId, type VariantId } from "./wire"

const VARIANTS: readonly VariantId[] = ["v1", "v2", "v3"]

/** A fresh stage and transport per run; the transport parses every success with the overlay's schema. */
function replay() {
  const stage = createStage(manifest)
  let now = 0
  const transport = replayTransport(stage, () => now)
  const call = async (op: Operation, body?: unknown) => {
    const reply = await transport({ op, query: new URLSearchParams(), body })
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
    now += 10_000
    await call("page")
    const view = operations.page.response.parse(await call("page"))
    const session = view.sessions.find((entry) => entry.id === id)
    expect(session?.variants.every((variant) => variant.state === "ready")).toBe(true)
    return id
  }
  return { stage, call, land, target, advance: () => (now += 10_000) }
}

/** Where an ask is picked: the file itself, or a scene's entry for a stylesheet. */
const pickedAt = (file: FileNode) =>
  file.kind === "style" ? (manifest.files.get(file.scene.entry) as FileNode) : file

const recorded = [...manifest.files.values()].flatMap((file) =>
  file.original.asks.map((ask) => ({ file, ask })),
)

describe("every recorded ask", () => {
  it("has three variants on every file, with a title short enough for the thread card", () => {
    expect(recorded.length).toBeGreaterThan(0)
    for (const { ask } of recorded)
      for (const variant of ask.variants) {
        expect(variant.meta.title.length, variant.revision.key).toBeLessThanOrEqual(36)
        expect(variant.meta.ms.total, variant.revision.key).toBeGreaterThan(
          15_000 + variant.meta.ms.agent + variant.meta.ms.checks,
        )
        const lands = variant.meta.ms.total / REPLAY_SPEED
        expect(lands, `${variant.revision.key} lands in ${lands} ms`).toBeGreaterThanOrEqual(1500)
        expect(lands, `${variant.revision.key} lands in ${lands} ms`).toBeLessThanOrEqual(5000)
      }
  })

  it.each(recorded.map(({ file, ask }) => [`${file.name}: ${ask.words}`, file, ask] as const))(
    "%s: asks, flips each variant, keeps each, and refines one step",
    async (_, file, ask) => {
      for (const variant of VARIANTS) {
        const { stage, call, land } = replay()
        const id = await land(pickedAt(file), ask)
        for (const choice of [...VARIANTS, "original" as const, variant])
          operations.show.response.parse(await call("show", { id, variant: choice }))
        expect(stage.snapshot().shown.get(file.path)?.key).toBe(
          ask.variants[VARIANTS.indexOf(variant)]?.revision.key,
        )
        operations.keep.response.parse(await call("keep", { id, variant }))
        const kept = stage.snapshot().kept.get(file.path)
        expect(kept?.from?.ask).toBe(ask)

        // Every other ask of every file is still offered on top of the keep.
        for (const other of recorded.filter((entry) => entry.ask !== ask))
          expect(manifest.offeredAt(pickedAt(other.file), stage.snapshot().kept)).toContain(
            other.ask,
          )

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

  it("offers each file's asks as suggestions where a designer picks it", async () => {
    const transport = replayTransport(createStage(manifest))
    for (const file of manifest.files.values()) {
      if (file.kind === "style") continue
      const reply = await transport({
        op: "suggest",
        query: new URLSearchParams({ path: file.path }),
        body: undefined,
      })
      const words = operations.suggest.response.parse(reply.body).suggestions.map((s) => s.words)
      expect(words).toEqual(manifest.offeredAt(file, manifest.original).map((ask) => ask.words))
    }
  })
})
