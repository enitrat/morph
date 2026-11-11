import { type Ref, useEffect, useState } from "react"

import { type SessionId, type SourceLoc, type Suggestion } from "../../variant/model"
import { bridge } from "../bridge"

type About = SourceLoc | SessionId

/** What the bridge suggests for a site or a session; none while it answers, or when it cannot. */
interface Suggested {
  readonly suggestions: readonly Suggestion[]
  readonly prefill: string | null
}

const NOTHING: Suggested = { suggestions: [], prefill: null }

export function useSuggestions(about: About | null): Suggested {
  const [found, setFound] = useState<{ about: About; suggested: Suggested } | null>(null)
  useEffect(() => {
    if (about === null) return undefined
    let live = true
    void bridge.suggest(about).then((answer) => {
      if (!live) return
      setFound({
        about,
        suggested: answer.ok
          ? { suggestions: answer.value.suggestions, prefill: answer.value.prefill ?? null }
          : NOTHING,
      })
    })
    return () => {
      live = false
    }
  }, [about])
  return found !== null && found.about === about ? found.suggested : NOTHING
}

const STEP: Partial<Record<string, 1 | -1>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

/** A field's ↓: focuses the first chip in `list`, or answers false when there is none. */
export function enterChips(list: HTMLElement | null): boolean {
  const first = list?.querySelector("button")
  first?.focus()
  return first != null
}

/**
 * Chips that ask with their words on a click or ↵. The arrows move between them, and stepping back
 * from the first calls `onLeave`, so the field it hangs under takes the focus again.
 */
export function Suggestions({
  suggestions,
  onPick,
  onLeave,
  ref,
}: {
  suggestions: readonly Suggestion[]
  onPick: (words: string) => void
  onLeave: () => void
  ref?: Ref<HTMLDivElement>
}) {
  if (suggestions.length === 0) return null
  return (
    <div ref={ref} role="group" aria-label="Suggestions" className="flex flex-wrap gap-1">
      {suggestions.map(({ words }, index) => (
        <button
          key={words}
          type="button"
          title={words}
          onClick={() => {
            onPick(words)
          }}
          onKeyDown={(event) => {
            const by = STEP[event.key]
            if (by === undefined) return
            event.preventDefault()
            const next = event.currentTarget.parentElement?.children[index + by]
            if (next instanceof HTMLElement) next.focus()
            else if (index + by < 0) onLeave()
          }}
          className="ring-focus flex h-(--item) max-w-full items-center rounded-full bg-surface-2 px-(--inset) text-sm text-ink transition-colors duration-150 hover:bg-surface-3"
        >
          <span className="truncate">{words}</span>
        </button>
      ))}
    </div>
  )
}
