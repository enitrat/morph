import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, expect, it } from "vitest"

import { farm } from "./slots"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tune-farm-")))
  dirs.push(dir)
  return dir
}

function file(root: string, path: string, text = "") {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function link(root: string, path: string, target: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  symlinkSync(target, join(root, path))
}

/** A pnpm layout in miniature: workspace packages linked relatively, third-party in the store. */
function workspace(root: string) {
  for (const name of ["ui", "config"]) file(root, `packages/${name}/index.ts`)
  file(root, "node_modules/.pnpm/dep@1.0.0/node_modules/dep/index.js")
  link(root, "node_modules/dep", ".pnpm/dep@1.0.0/node_modules/dep")
  link(root, "node_modules/@acme/config", "../../packages/config")
  link(root, "node_modules/.pnpm/node_modules/@acme/ui", "../../../../packages/ui")
  link(root, "apps/site/node_modules/@acme/ui", "../../../../packages/ui")
  link(root, "apps/site/node_modules/dep", "../../../node_modules/.pnpm/dep@1.0.0/node_modules/dep")
}

it("resolves every workspace package inside the slot and shares only the package store", async () => {
  const live = temp()
  const slot = temp()
  workspace(live)
  for (const name of ["ui", "config"]) file(slot, `packages/${name}/index.ts`)
  file(slot, "apps/site/page.tsx")

  await farm(live, slot)

  const resolved = (path: string) => realpathSync(join(slot, path))
  expect(resolved("apps/site/node_modules/@acme/ui")).toBe(join(slot, "packages/ui"))
  expect(resolved("node_modules/@acme/config")).toBe(join(slot, "packages/config"))
  expect(resolved("node_modules/.pnpm/node_modules/@acme/ui")).toBe(join(slot, "packages/ui"))
  expect(resolved("apps/site/node_modules/dep")).toBe(
    join(live, "node_modules/.pnpm/dep@1.0.0/node_modules/dep"),
  )
})
