import { type Dispatch, useEffect, useMemo } from "react"

import { actionsOf, type SessionActions } from "./ask"
import { type Event, type State } from "./model"
import { resolveTargets } from "./pinned-targets"
import { observeSubmissions, writePins } from "./session-store"

const POLL_OPEN_MS = 1000
const POLL_CLOSED_MS = 4000
const NOTICE_MS = 3200
/** Polls session state, restores target matches, and owns request and notice lifetimes. */
export function useSessions(state: State, dispatch: Dispatch<Event>): SessionActions {
  const actions = useMemo(() => actionsOf(dispatch), [dispatch])
  const { open, sessions } = state
  const { page, pins, notice } = sessions

  useEffect(() => actions.dispose, [actions])

  useEffect(() => {
    actions.poll()
    const timer = setInterval(actions.poll, open ? POLL_OPEN_MS : POLL_CLOSED_MS)
    return () => {
      clearInterval(timer)
    }
  }, [actions, open])

  useEffect(() => {
    writePins(pins)
  }, [pins])
  useEffect(() => {
    observeSubmissions(page)
  }, [page])

  useEffect(() => {
    for (const pin of Object.values(pins)) {
      if (pin === undefined) continue
      const resolved = resolveTargets(pin.targets)
      if (resolved.some((target, slot) => target !== pin.targets[slot]))
        dispatch({ kind: "retargeted", id: pin.id, matches: resolved.map(({ match }) => match) })
    }
  })

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
