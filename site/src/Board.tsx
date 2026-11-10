import { useEffect, useState, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

import { type Body, type Drawn, DrawnRepo } from "../stage/live"
import type { Repo } from "../stage/manifest"
import type { Stage } from "../stage/stage"
import { Table } from "../scenes/table/Table"

/** Every file's body, or null while one of them is still loading. */
export function drawnOf(repo: Repo): Drawn | null {
  const drawn = new Map<string, Body>()
  for (const [path, revision] of repo) {
    const body = revision.body()
    if (body === undefined) return null
    drawn.set(path, body)
  }
  return drawn
}

const same = (a: Repo, b: Repo) =>
  a.size === b.size && [...a].every(([path, revision]) => b.get(path) === revision)

/**
 * Names every object and part on the live board after its own attributes, so each one morphs as
 * itself wherever its new layout puts it, and an object added later needs no stylesheet entry.
 */
function nameMorphs() {
  const board = document.querySelector<HTMLElement>('[data-repo="live"] [data-board]')
  if (board === null) return
  board.style.viewTransitionName = "board"
  // With reduced motion only the board is named, so it cross-fades as one and nothing moves.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
  for (const element of board.querySelectorAll<HTMLElement>("[data-object], [data-part]")) {
    const object = element.closest<HTMLElement>("[data-object]")?.dataset.object
    const part = element.dataset.part
    element.style.viewTransitionName = part === undefined ? `${object}` : `${object}-${part}`
  }
}

/**
 * The repo the stage shows, drawn once every file's chunk has loaded, so the old design stays up
 * until the new one replaces it. Each change is one View Transition, however many files moved.
 */
function useShown(stage: Stage): Drawn {
  const { shown } = useSyncExternalStore(stage.subscribe, stage.snapshot)
  const [view, setView] = useState(() => ({ repo: shown, drawn: drawnOf(shown) as Drawn }))
  useEffect(() => {
    if (same(shown, view.repo)) return undefined
    let current = true
    void Promise.all([...shown.values()].map((revision) => revision.load())).then(() => {
      const drawn = drawnOf(shown)
      if (!current || drawn === null) return
      const next = { repo: shown, drawn }
      if (document.startViewTransition === undefined) setView(next)
      else {
        nameMorphs()
        // A morph that starts before the last one finished skips it, which rejects `ready`.
        document
          .startViewTransition(() => {
            flushSync(() => setView(next))
            nameMorphs()
          })
          .ready.catch(() => {})
      }
    })
    return () => {
      current = false
    }
  }, [shown, view.repo])
  return view.drawn
}

/**
 * One board drawn from `drawn`: the table's stylesheets apply inside it only, so a version's
 * thumbnail keeps its own art direction beside the live board.
 */
export function Board({ drawn, id }: { drawn: Drawn; id: string }) {
  const css = [...drawn.values()].flatMap((body) => (body.kind === "style" ? [body.css] : []))
  return (
    <DrawnRepo value={drawn}>
      <div data-repo={id}>
        <style>{`[data-repo="${id}"] {\n${css.join("\n")}\n}`}</style>
        <Table />
      </div>
    </DrawnRepo>
  )
}

export function LiveBoard({ stage }: { stage: Stage }) {
  return <Board drawn={useShown(stage)} id="live" />
}
