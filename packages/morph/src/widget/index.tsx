"use client"

import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"

import { connect, type Transport } from "../overlay/bridge"
import { Overlay } from "../overlay/overlay"
import { registerFonts } from "../overlay/ui/fonts"
import { SENTINEL } from "./sentinel"

export { httpTransport, type Transport, type WireCall, type WireReply } from "../overlay/bridge"

const MOUNTED = Symbol.for("morph.overlay")

interface Holder {
  [MOUNTED]?: { host: HTMLElement; root: Root }
}

/**
 * Renders the overlay into a shadow root on a `morph-root` appended to `<html>`, outside `body`
 * so the app's layout never moves for it. The overlay has its own React root: a variant that
 * crashes the host's tree does not take it down, so it is never unmounted with the host. `bridge`
 * is the path the bridge answers on, which the adapter that mounts it chose, or a transport that
 * answers in its place.
 */
export function mountMorph(bridge: string | Transport) {
  connect(bridge)
  registerFonts()
  const holder = window as Holder
  const mounted = holder[MOUNTED]
  if (mounted?.host.isConnected) {
    mounted.root.render(<Overlay />)
    return
  }
  const host = document.createElement("morph-root")
  host.dataset.morph = SENTINEL
  document.documentElement.append(host)
  const root = createRoot(host.attachShadow({ mode: "open" }))
  root.render(<Overlay />)
  holder[MOUNTED] = { host, root }
}

/** Removes the document's Morph overlay when the host intentionally stops it. */
export function unmountMorph() {
  const holder = window as Holder
  const mounted = holder[MOUNTED]
  if (mounted === undefined) return
  delete holder[MOUNTED]
  mounted.root.unmount()
  mounted.host.remove()
}

/** Mounts the overlay from a React tree, talking to the bridge at `base`. */
export function MorphWidget({ base }: { base: string }) {
  useEffect(() => mountMorph(base), [base])
  return null
}
