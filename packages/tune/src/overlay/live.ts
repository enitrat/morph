import { type Dispatch, useEffect, useEffectEvent, useMemo, useRef } from "react"

import { type SessionId } from "../variant/model"
import { actionsOf, type SessionActions } from "./ask"
import { type Event, type Spot, type State } from "./model"
import { pickedOf, repicked } from "./repick"
import { type NewPin, type Pin } from "./sessions"
import { specOf } from "./specs"

const POLL_OPEN_MS = 1000
const POLL_CLOSED_MS = 4000
const NOTICE_MS = 3200
const STORE = "tune:pins"

/** What a pin needs to come back after a reload, stored per session in this browser. */
interface Stored {
  n: number
  name: string
  words: string
  file: string | null
  at: Spot[]
}

function readStore(): Record<string, Stored> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE) ?? "{}")
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, Stored>) : {}
  } catch {
    return {}
  }
}

function writeStore(pins: State["sessions"]["pins"]) {
  const stored: Record<string, Stored> = {}
  for (const pin of Object.values(pins))
    if (pin !== undefined)
      stored[pin.id] = {
        n: pin.n,
        name: pin.name,
        words: pin.words,
        file: pin.file,
        at: pin.picked.map((picked) => picked.at),
      }
  try {
    localStorage.setItem(STORE, JSON.stringify(stored))
  } catch {
    // Storage off (private mode): pins still work, they just do not survive a reload.
  }
}

/** The elements a pin is about, as the page draws them now. */
export const targetsOf = (pin: Pin): Element[] =>
  pin.picked.flatMap(({ element }) => (element?.isConnected ? [element] : []))

const sameSpec = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Keeps the overlay's session state live: polls the page view, gives sessions a reload left
 * open their pins back, finds a target again once a variant redraws it, and measures each target
 * while its session shows the original, for the variant delta in Specs.
 */
export function useSessions(state: State, dispatch: Dispatch<Event>): SessionActions {
  const actions = useMemo(() => actionsOf(dispatch), [dispatch])
  const { open, sessions } = state
  const { page, pins, notice } = sessions
  const pinnedOnce = useRef(new Set<SessionId>())
  const originalBefore = useRef(new Set<SessionId>())

  useEffect(() => {
    actions.poll()
    const timer = setInterval(actions.poll, open ? POLL_OPEN_MS : POLL_CLOSED_MS)
    return () => {
      clearInterval(timer)
    }
  }, [actions, open])

  useEffect(() => {
    for (const pin of Object.values(pins)) if (pin !== undefined) pinnedOnce.current.add(pin.id)
    writeStore(pins)
  }, [pins])

  useEffect(() => {
    const lost = page.sessions.filter(
      (view) => pins[view.id] === undefined && !pinnedOnce.current.has(view.id),
    )
    if (lost.length === 0) return
    const stored = readStore()
    const back: NewPin[] = lost.map((view) => {
      const found = stored[view.id]
      return {
        id: view.id,
        n: found?.n ?? null,
        name: found?.name ?? "Session",
        words: found?.words ?? "",
        file: found?.file ?? null,
        picked: (found?.at ?? []).map((at) => ({ element: null, at })),
        baseline: null,
      }
    })
    for (const pin of back) pinnedOnce.current.add(pin.id)
    dispatch({ kind: "rejoined", pins: back })
  }, [page, pins, dispatch])

  // A target the variant redrew, or one a reload lost, is picked again at its spot.
  useEffect(() => {
    for (const pin of Object.values(pins)) {
      if (pin === undefined) continue
      if (pin.picked.every(({ element }) => element?.isConnected)) continue
      const found = repicked(pin.picked)
      if (found.length > 0)
        dispatch({ kind: "retargeted", id: pin.id, picked: found.map(pickedOf) })
    }
  })

  // The original is measured once a session has shown it for a whole poll, so a measure never
  // catches the variant still on the page before the dev server reloads it.
  const measure = useEffectEvent(() => {
    const now = new Set<SessionId>()
    for (const view of page.sessions) {
      if (view.place.kind !== "original") continue
      now.add(view.id)
      const pin = pins[view.id]
      const target = pin && targetsOf(pin)[0]
      if (!originalBefore.current.has(view.id) || pin === undefined || target === undefined)
        continue
      const spec = specOf(target)
      if (!sameSpec(spec, pin.baseline)) dispatch({ kind: "measured", id: view.id, baseline: spec })
    }
    originalBefore.current = now
  })
  useEffect(() => {
    measure()
  }, [page])

  useEffect(() => {
    if (notice === null) return undefined
    const timer = setTimeout(() => {
      dispatch({ kind: "unnoticed", key: notice.key })
    }, NOTICE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [notice, dispatch])

  return actions
}
