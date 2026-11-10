import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, expect, it } from "vitest"

import { outside } from "./contain"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function layout() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "morph-contain-")))
  dirs.push(root)
  const slot = join(root, "slot")
  const live = join(root, "live")
  mkdirSync(join(slot, "src"), { recursive: true })
  mkdirSync(join(live, "src"), { recursive: true })
  symlinkSync(join(live, "src"), join(slot, "escape"))
  return { slot, live }
}

it("accepts writes inside the slot, new files and folders included", async () => {
  const { slot } = layout()

  const escaped = await outside(slot, [
    join(slot, "src/card.tsx"),
    "src/new/notice.tsx",
    join(slot, "src/../src/row.tsx"),
  ])

  expect(escaped).toEqual([])
})

it("names every write aimed outside the slot, through `..`, an absolute path or a symlink", async () => {
  const { slot, live } = layout()
  const writes = [
    join(live, "src/card.tsx"),
    "../live/src/card.tsx",
    join(slot, "escape/card.tsx"),
    "src/ok.tsx",
  ]

  expect(await outside(slot, writes)).toEqual(writes.slice(0, 3))
})
