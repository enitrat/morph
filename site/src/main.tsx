import "./styles.css"

import { mountMorph } from "@enitrat/morph/widget"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { manifest } from "../stage/manifest"
import { replayTransport } from "../stage/replay"
import { createStage } from "../stage/stage"
import { App } from "./App"

const stage = createStage(manifest)

// Every visit starts from the original page: pins a reload brought back would point at sessions
// this tab's stage never had.
localStorage.removeItem("morph:pins")

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App stage={stage} />
  </StrictMode>,
)

requestIdleCallback(() => mountMorph(replayTransport(stage)))
