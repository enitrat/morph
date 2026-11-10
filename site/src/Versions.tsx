import { useSyncExternalStore } from "react"

import { resetReceipt } from "../scenes/receipt/data"
import type { Stage, Version } from "../stage/stage"
import { Board, drawnOf } from "./Board"
import { LEVEL } from "./Ledger"

const LETTER = { v1: "A", v2: "B", v3: "C" } as const
const COL = 150
const ROW = 112
/** The width a thumbnail draws the board at before scaling it down. */
const DRAWN = 1180
const SCALE = 0.1

/** Each version's column and row: a keep goes right of its parent, a branch drops a row. */
function layout(versions: readonly Version[]): Map<number, { col: number; row: number }> {
  const at = new Map<number, { col: number; row: number }>()
  let rows = 0
  const place = (version: Version, col: number, row: number) => {
    at.set(version.id, { col, row })
    versions
      .filter((child) => child.parent === version.id)
      .forEach((child, index) => {
        place(child, col + 1, index === 0 ? row : ++rows)
      })
  }
  if (versions[0] !== undefined) place(versions[0], 0, 0)
  return at
}

function Thumb({ version }: { version: Version }) {
  const drawn = drawnOf(version.repo)
  return (
    <div className="relative h-[72px] w-[118px] overflow-hidden rounded-lg bg-[#131417]">
      {drawn !== null && (
        <div
          inert
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
          style={{ width: DRAWN, transform: `scale(${SCALE})` }}
        >
          <Board drawn={drawn} id={`v${version.id}`} />
        </div>
      )}
    </div>
  )
}

/** Every kept state of the board as a tree, labelled by the ask that made it; click to go back. */
export function Versions({ stage }: { stage: Stage }) {
  const { versions, at } = useSyncExternalStore(stage.subscribe, stage.snapshot)
  const spots = layout(versions)
  const rows = Math.max(...[...spots.values()].map((spot) => spot.row)) + 1
  const cols = Math.max(...[...spots.values()].map((spot) => spot.col)) + 1
  return (
    <section
      data-morph
      aria-label="Versions"
      className="mt-3 flex flex-col gap-3 rounded-[16px] border border-line bg-[#0f1013] p-4 sm:flex-row sm:gap-6"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 sm:w-[150px] sm:flex-col">
        <div>
          <h2 className="text-[13px] font-medium text-text">Versions</h2>
          <p className="mt-1 text-[12px]/[1.4] text-faint">
            {versions.length === 1
              ? "Each keep lands here. Click one to go back."
              : `${versions.length - 1} kept. Click one to go back.`}
          </p>
        </div>
        <button
          type="button"
          disabled={versions.length === 1 && at === 0}
          onClick={() => {
            stage.reset()
            resetReceipt()
          }}
          className="rounded-[7px] border border-[#2c2f36] bg-[#16181c] px-2.5 py-1.5 text-[12px]/none font-medium text-text transition-colors hover:border-[#3a3e47] disabled:opacity-40"
        >
          Reset
        </button>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="relative" style={{ width: cols * COL, height: rows * ROW - 12 }}>
          <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {versions.map((version) => {
              const from = version.parent === null ? undefined : spots.get(version.parent)
              const to = spots.get(version.id)
              if (from === undefined || to === undefined) return null
              const x1 = from.col * COL + 118
              const y1 = from.row * ROW + 36
              const x2 = to.col * COL
              const y2 = to.row * ROW + 36
              const bend = x2 - 16
              return (
                <path
                  key={version.id}
                  d={`M${x1} ${y1} H${bend} V${y2} H${x2}`}
                  fill="none"
                  stroke="#2c2f36"
                  strokeWidth={1.25}
                />
              )
            })}
          </svg>
          {versions.map((version) => {
            const spot = spots.get(version.id)
            if (spot === undefined) return null
            const current = version.id === at
            const kept = version.kept
            return (
              <div
                key={version.id}
                className="group absolute flex w-[118px] flex-col gap-1.5"
                style={{ left: spot.col * COL, top: spot.row * ROW }}
              >
                {/* A cover, not a wrapper: the thumbnail draws the board, buttons and all. */}
                <button
                  type="button"
                  aria-current={current || undefined}
                  aria-label={`Go back to version ${version.id}`}
                  onClick={() => {
                    stage.jump(version.id)
                  }}
                  className="absolute inset-0 z-10 rounded-lg"
                />
                <span
                  className={`block rounded-lg transition-shadow ${
                    current
                      ? "shadow-[0_0_0_2px_var(--color-ice)]"
                      : "shadow-[inset_0_0_0_1px_#24262b] group-hover:shadow-[inset_0_0_0_1px_#3a3e47]"
                  }`}
                >
                  <Thumb version={version} />
                </span>
                <span className="grid gap-0.5 text-[11.5px]/[1.25]">
                  <span className="truncate text-text">
                    {kept === null ? "Original" : kept.ask.words}
                  </span>
                  <span className="truncate font-mono text-[10.5px] text-faint">
                    v{version.id}
                    {kept !== null && ` · ${LEVEL[kept.ask.base.file.level]} ${LETTER[kept.id]}`}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
