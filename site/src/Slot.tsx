import { type ComponentType, useEffect, useState, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

import type { SceneNode } from "../stage/manifest"
import type { Stage } from "../stage/stage"

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Runs a DOM update as a View Transition where the browser has them, so the old design morphs into the new. */
function morph(update: () => void) {
  if (document.startViewTransition === undefined || still()) update()
  else document.startViewTransition(() => flushSync(update))
}

/**
 * Renders the revision the stage shows for a scene. A new revision loads its chunk first, so the
 * old design stays up until the new one can replace it in one transition.
 */
export function Slot({ stage, scene }: { stage: Stage; scene: SceneNode }) {
  const revision = useSyncExternalStore(stage.subscribe, () => stage.shown(scene.id))
  const [view, setView] = useState<{ key: string; Entry: ComponentType }>(() => ({
    key: scene.original.key,
    Entry: scene.Entry,
  }))

  useEffect(() => {
    if (revision.key === view.key) return undefined
    let live = true
    void revision.load().then((Entry) => {
      if (live) morph(() => setView({ key: revision.key, Entry }))
    })
    return () => {
      live = false
    }
  }, [revision, view.key])

  // The overlay names a pick after the outermost component it is the root of; without an element
  // of its own here, the scene's root would read as `Slot`.
  return (
    <div className="contents">
      <view.Entry />
    </div>
  )
}
