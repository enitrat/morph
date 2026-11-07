"use client"

import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"

import { connect } from "../overlay/bridge"
import { Overlay } from "../overlay/overlay"
import { SENTINEL } from "./sentinel"

const MOUNTED = Symbol.for("tune.overlay")

interface Holder {
  [MOUNTED]?: { host: HTMLElement; root: Root }
}

/**
 * Renders the overlay into a shadow root on a `tune-root` appended to `<html>`, outside `body`
 * so the app's layout never moves for it. The overlay has its own React root: a variant that
 * crashes the host's tree does not take it down, so it is never unmounted with the host. `base` is
 * the path the bridge answers on, which the adapter that mounts it chose.
 */
export function mountTune(base: string) {
  connect(base)
  const holder = window as Holder
  const mounted = holder[MOUNTED]
  if (mounted?.host.isConnected) {
    mounted.root.render(<Overlay />)
    return
  }
  const host = document.createElement("tune-root")
  host.dataset.tune = SENTINEL
  document.documentElement.append(host)
  const root = createRoot(host.attachShadow({ mode: "open" }))
  root.render(<Overlay />)
  holder[MOUNTED] = { host, root }
}

/** Removes the document's Tune overlay when the host intentionally stops it. */
export function unmountTune() {
  const holder = window as Holder
  const mounted = holder[MOUNTED]
  if (mounted === undefined) return
  delete holder[MOUNTED]
  mounted.root.unmount()
  mounted.host.remove()
}

/** Mounts the overlay from a React tree, talking to the bridge at `base`. */
export function TuneWidget({ base }: { base: string }) {
  useEffect(() => mountTune(base), [base])
  return null
}
