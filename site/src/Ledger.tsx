import { useEffect, useState, useSyncExternalStore } from "react"

import type { Revision, VariantNode } from "../stage/manifest"
import type { Stage, Version } from "../stage/stage"
import type { Stat } from "../stage/wire"

const LETTER = { v1: "A", v2: "B", v3: "C" } as const

export const LEVEL = { part: "Part", object: "Object", table: "Table" } as const
const ORDER = { part: 0, object: 1, table: 2 } as const

interface Diff {
  readonly stat: Stat
  readonly lines: readonly {
    readonly kind: "add" | "del" | "same" | "gap"
    readonly text: string
  }[]
}

/** The unified diff from the original to the kept revision, as `git diff` would print it. */
function useDiff(original: Revision, kept: Revision): Diff | null {
  const [diff, setDiff] = useState<{ key: string; diff: Diff } | null>(null)
  useEffect(() => {
    let current = true
    void Promise.all([import("diff"), original.source(), kept.source()]).then(
      ([{ structuredPatch }, before, after]) => {
        const patch = structuredPatch("a", "b", before, after, "", "", { context: 2 })
        const lines: Diff["lines"][number][] = []
        let add = 0
        let del = 0
        for (const hunk of patch.hunks) {
          lines.push({
            kind: "gap",
            text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          })
          for (const line of hunk.lines) {
            const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "same"
            if (kind === "add") add++
            if (kind === "del") del++
            lines.push({ kind, text: line })
          }
        }
        if (current) setDiff({ key: kept.key, diff: { stat: { add, del }, lines } })
      },
    )
    return () => {
      current = false
    }
  }, [original, kept])
  return diff?.key === kept.key ? diff.diff : null
}

const TONE = {
  add: "bg-[rgb(95_211_141/0.1)] text-[#bfeccf]",
  del: "bg-[rgb(255_122_122/0.1)] text-[#f5c1c1]",
  same: "text-[#8c909a]",
  gap: "text-[#5f6779]",
} as const

function Line({
  variant,
  original,
  kept,
}: {
  variant: VariantNode
  original: Revision
  kept: Revision
}) {
  const [open, setOpen] = useState(false)
  const diff = useDiff(original, kept)
  const { file } = original
  const stat = diff?.stat ?? variant.stat
  return (
    <li className="min-w-0 overflow-hidden rounded-[10px] border border-line bg-[#101114]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left sm:grid-cols-[64px_minmax(0,1fr)_auto_auto]"
      >
        <span className="w-fit rounded-[5px] bg-[#1d2027] px-1.5 py-[3px] font-mono text-[10.5px]/none text-muted">
          {LEVEL[file.level]}
        </span>
        <span className="min-w-0 truncate text-[13px] text-text">
          <span className="font-mono text-[12.5px]">{file.path.split("/").at(-1)}</span>
          <span className="text-muted">
            {" "}
            · “{variant.ask.words}” · {LETTER[variant.id]} {variant.meta.title}
          </span>
        </span>
        <span className="font-mono text-[12px] tabular-nums">
          <span className="text-add">+{stat.add}</span>{" "}
          <span className="text-del">−{stat.del}</span>
        </span>
        <span className="hidden text-[12px] text-ice sm:inline">
          {open ? "Hide diff" : "View diff"}
        </span>
      </button>
      {open && (
        <pre className="max-h-[320px] overflow-auto border-t border-line py-2 font-mono text-[11px]/[17px]">
          {diff === null ? (
            <span className="px-3 text-faint">Reading the diff…</span>
          ) : (
            diff.lines.map((line, at) => (
              <div key={at} className={`px-3 whitespace-pre ${TONE[line.kind]}`}>
                {line.text}
              </div>
            ))
          )}
        </pre>
      )}
    </li>
  )
}

/** The variants behind the board's version, newest first per file. */
function keptAlong(versions: readonly Version[], at: number): Map<string, VariantNode> {
  const kept = new Map<string, VariantNode>()
  for (let version = versions[at]; version !== undefined; version = versions[version.parent ?? -1])
    if (version.kept !== null && !kept.has(version.kept.ask.base.file.path))
      kept.set(version.kept.ask.base.file.path, version.kept)
  return kept
}

/** One line per file the board's version changed, with its real diff from the original. */
/** Every scene's live state; each `data.ts` exports `reset`, which puts it back as first drawn. */
const live = Object.values(
  import.meta.glob<{ reset: () => void }>("../scenes/*/data.ts", { eager: true }),
)

export function Ledger({ stage }: { stage: Stage }) {
  const snapshot = useSyncExternalStore(stage.subscribe, stage.snapshot)
  const kept = keptAlong(snapshot.versions, snapshot.at)
  const lines = [...snapshot.kept]
    .flatMap(([path, revision]) => {
      const variant = kept.get(path)
      const file = stage.manifest.files.get(path)
      return variant && file && revision !== file.original
        ? [{ path, variant, original: file.original, revision }]
        : []
    })
    .toSorted((a, b) => ORDER[a.variant.ask.base.file.level] - ORDER[b.variant.ask.base.file.level])
  return (
    <section data-morph aria-label="Kept" className="mt-8">
      <h2 className="flex items-baseline gap-3 text-[13px] font-medium text-text">
        Kept
        <span className="font-normal text-faint">
          {lines.length === 0
            ? "Keep a variant and its diff lands here."
            : `${lines.length} ${lines.length === 1 ? "file" : "files"} changed`}
        </span>
        {lines.length > 0 && (
          <button
            type="button"
            className="ml-auto text-[12px] font-normal text-faint hover:text-text"
            onClick={() => {
              stage.reset()
              for (const scene of live) scene.reset()
            }}
          >
            Reset the table
          </button>
        )}
      </h2>
      {lines.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {lines.map((line) => (
            <Line
              key={line.path}
              variant={line.variant}
              original={line.original}
              kept={line.revision}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
