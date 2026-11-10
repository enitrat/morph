import "./styles.css"

import { mountMorph } from "@enitrat/morph/widget"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { manifest } from "../stage/manifest"
import { replayTransport } from "../stage/replay"
import { createStage } from "../stage/stage"
import { App } from "./App"

const stage = createStage(manifest)
// The overlay is built around hover and the keyboard; a phone drives the stage by tap instead.
const touch = matchMedia("(pointer: coarse)").matches

// Every visit starts from the original page: pins a reload brought back would point at sessions
// this tab's stage never had.
localStorage.removeItem("morph:pins")

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App stage={stage} touch={touch} />
  </StrictMode>,
)

if (!touch) requestIdleCallback(() => mountMorph(replayTransport(stage)))
