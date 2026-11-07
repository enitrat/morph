"use client"

import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"

import { Overlay } from "../overlay/overlay"
import { SENTINEL } from "./sentinel"

const MOUNTED = Symbol.for("retouch.overlay")

interface Holder {
  [MOUNTED]?: { host: HTMLElement; root: Root }
}

/**
 * Renders the overlay into a shadow root on a `retouch-root` appended to `<html>`, outside `body`
 * so the app's layout never moves for it. The overlay has its own React root: a variant that
 * crashes the host's tree does not take it down, so it is never unmounted with the host.
 */
function mountOverlay() {
  const holder = window as Holder
  const mounted = holder[MOUNTED]
  if (mounted?.host.isConnected) {
    mounted.root.render(<Overlay />)
    return
  }
  const host = document.createElement("retouch-root")
  host.dataset.retouch = SENTINEL
  document.documentElement.append(host)
  const root = createRoot(host.attachShadow({ mode: "open" }))
  root.render(<Overlay />)
  holder[MOUNTED] = { host, root }
}

export function RetouchWidget() {
  useEffect(mountOverlay, [])
  return null
}
