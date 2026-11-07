import "./globals.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { Page } from "./page"

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
