import { z } from "zod"

import { type Tab } from "./model"

const KEY = "morph:tools"
const Tools = z.array(z.enum(["specs", "tune"])).catch([])

/** The advanced tabs this browser turned on, none until the designer opts in. */
export function readTools(): readonly Tab[] {
  try {
    return Tools.parse(JSON.parse(localStorage.getItem(KEY) ?? "[]"))
  } catch {
    return []
  }
}

export function writeTools(tools: readonly Tab[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tools))
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}
