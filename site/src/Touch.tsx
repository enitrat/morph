import { useEffect, useState, useSyncExternalStore } from "react"

import type { AskNode, FileNode } from "../stage/manifest"
import type { Stage } from "../stage/stage"
import { type PageView, SessionId, type VariantId } from "../stage/wire"
import { LEVEL } from "./Ledger"

const LETTERS = [
  ["v1", "A"],
  ["v2", "B"],
  ["v3", "C"],
] as const

const TITLE: Record<string, string> = {
  ReceiptTotal: "The total",
  ReceiptItems: "The items",
  Receipt: "The receipt",
  theme: "The whole table",
}

/** Where a phone drives the stage without the overlay: the same asks, flips and keeps, by tap. */
export function Touch({ stage }: { stage: Stage }) {
  const snapshot = useSyncExternalStore(stage.subscribe, stage.snapshot)
  const [id, setId] = useState<SessionId | null>(null)
  const [page, setPage] = useState<PageView | null>(null)
  const open = snapshot.sessions.find((session) => session.id === id)
  const view = page?.sessions.find((session) => session.id === id)

  useEffect(() => {
    if (open === undefined) return undefined
    const tick = () => setPage(stage.poll(performance.now()))
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [open, stage])

  const shownOf = (): VariantId | null => {
    const place = open?.place
    return place?.kind === "shown" ? place.variant : null
  }

  const ask = (file: FileNode, node: AskNode) => {
    const shown = shownOf()
    if (open !== undefined)
      if (shown !== null) stage.keep(open.id, shown)
      else stage.discard(open.id)
    const next = SessionId.parse(crypto.randomUUID())
    stage.ask({ id: next, path: file.path, words: node.words }, performance.now())
    setId(next)
  }

  const groups = [...stage.manifest.files.values()].flatMap((file) => {
    const asks = snapshot.kept.get(file.path)?.asks ?? []
    return asks.length === 0 ? [] : [{ file, asks }]
  })

  return (
    <section
      data-morph
      aria-label="Asks"
      className="mt-3 grid gap-3 rounded-[16px] border border-line bg-[#0f1013] p-4"
    >
      <p className="text-[12.5px]/[1.45] text-muted">
        The overlay runs on desktop. Here, tap an ask and watch what Morph writes.
      </p>
      {open !== undefined && view !== undefined && (
        <div className="grid gap-2 rounded-[12px] bg-[#16181d] p-3">
          <p className="text-[13px] text-text">“{open.ask.words}”</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LETTERS.map(([variant, letter], index) => {
              const state = view.variants[index]
              const ready = state?.state === "ready"
              const on = shownOf() === variant
              return (
                <button
                  key={variant}
                  type="button"
                  disabled={!ready}
                  aria-pressed={on}
                  onClick={() => {
                    stage.show(open.id, variant, performance.now())
                  }}
                  className={`h-10 rounded-[8px] font-mono text-[13px] font-semibold transition-colors ${
                    on
                      ? "bg-ice text-[#071523]"
                      : ready
                        ? "bg-[#22252c] text-text"
                        : "bg-[#1a1c21] text-faint"
                  }`}
                >
                  {ready ? letter : `${letter}…`}
                </button>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={shownOf() === null}
              onClick={() => {
                const shown = shownOf()
                if (shown !== null) stage.keep(open.id, shown)
              }}
              className="h-9 flex-1 rounded-[8px] bg-ice text-[13px] font-semibold text-[#071523] disabled:opacity-40"
            >
              Keep{shownOf() !== null ? ` ${LETTERS.find(([v]) => v === shownOf())?.[1]}` : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                stage.discard(open.id)
              }}
              className="h-9 rounded-[8px] px-3 text-[13px] font-medium text-del"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {groups.map(({ file, asks }) => (
        <div key={file.path} className="grid gap-1.5">
          <p className="text-[11.5px] text-faint">
            <span className="font-mono">{LEVEL[file.level]}</span> · {TITLE[file.name] ?? file.name}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {asks.map((node) => (
              <button
                key={node.slug}
                type="button"
                aria-pressed={open?.ask === node}
                onClick={() => {
                  ask(file, node)
                }}
                className="rounded-full border border-[#2e3138] bg-[#1a1c21] px-3 py-2 text-[12.5px]/none text-[#dcdcd7] aria-pressed:border-ice aria-pressed:bg-ice aria-pressed:text-[#071523]"
              >
                {node.words}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
