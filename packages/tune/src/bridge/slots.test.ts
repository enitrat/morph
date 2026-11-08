import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"

import { afterEach, expect, it } from "vitest"

import { CommitId } from "../variant/model"
import { openRepo } from "./git"
import { acquire, farm, release, SLOT_IDS, slotsRoot } from "./slots"

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
  execFileSync("git", ["init", "-q", root])
  file(root, "apps/site/package.json", "{}")
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

it("copies dependencies without a pnpm store", async () => {
  const live = temp()
  const slot = temp()
  execFileSync("git", ["init", "-q", live])
  file(live, "node_modules/example/index.js", "export default 42")
  await farm(live, slot)
  expect(realpathSync(join(slot, "node_modules/example/index.js"))).toBe(
    join(slot, "node_modules/example/index.js"),
  )
})

it("makes ignored workspace build output available in a variant worktree", async () => {
  const live = temp()
  execFileSync("git", ["init", "-q", live])
  file(live, ".gitignore", "node_modules\ndist\n.next\n")
  file(live, "packages/ui/package.json", '{"name":"ui","exports":"./dist/index.js"}')
  file(live, "packages/ui/dist/index.js", "export default 42")
  file(live, ".next/dev/types/routes.d.ts", "generated types")
  file(live, "packages/tracked/package.json", '{"name":"tracked"}')
  file(live, "packages/tracked/dist/index.js", "committed")
  file(live, "node_modules/.keep")
  execFileSync("git", ["-C", live, "add", "."])
  execFileSync("git", ["-C", live, "add", "-f", "packages/tracked/dist/index.js"])
  execFileSync("git", [
    "-C",
    live,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "fixture",
  ])
  file(live, "packages/tracked/dist/index.js", "uncommitted")
  const repo = await openRepo(live)
  dirs.push(await slotsRoot(repo))
  const base = CommitId.parse(
    execFileSync("git", ["-C", live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  )
  const slot = await acquire(repo, base)
  try {
    expect(readFileSync(join(slot.dir, "packages/ui/dist/index.js"), "utf8")).toBe(
      "export default 42",
    )
    expect(readFileSync(join(slot.dir, ".next/dev/types/routes.d.ts"), "utf8")).toBe(
      "generated types",
    )
    expect(readFileSync(join(slot.dir, "packages/tracked/dist/index.js"), "utf8")).toBe("committed")
  } finally {
    await release(slot)
  }
})

it("refreshes dependencies when a slot is reused", async () => {
  const live = temp()
  execFileSync("git", ["init", "-q", live])
  file(live, ".gitignore", "node_modules\n")
  file(live, "packages/ui/package.json", '{"name":"ui"}')
  file(live, "packages/ui/node_modules/old/index.js", "old")
  file(live, "node_modules/.keep")
  execFileSync("git", ["-C", live, "add", "."])
  execFileSync("git", [
    "-C",
    live,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "fixture",
  ])
  const repo = await openRepo(live)
  dirs.push(await slotsRoot(repo))
  const base = CommitId.parse(
    execFileSync("git", ["-C", live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  )
  const first = await acquire(repo, base)
  await release(first)
  rmSync(join(live, "packages/ui/node_modules/old"), { recursive: true })
  file(live, "packages/ui/node_modules/new/index.js", "new")
  const second = await acquire(repo, base)
  try {
    expect(second.dir).toBe(first.dir)
    expect(readFileSync(join(second.dir, "packages/ui/node_modules/new/index.js"), "utf8")).toBe(
      "new",
    )
    expect(() => readFileSync(join(second.dir, "packages/ui/node_modules/old/index.js"))).toThrow()
  } finally {
    await release(second)
  }
})

it("waits for a slot to free when every slot is taken, and stops waiting on abort", async () => {
  const live = temp()
  execFileSync("git", ["init", "-q", live])
  file(live, "page.tsx", "page")
  execFileSync("git", ["-C", live, "add", "."])
  execFileSync("git", [
    "-C",
    live,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "fixture",
  ])
  const repo = await openRepo(live)
  dirs.push(await slotsRoot(repo))
  const base = CommitId.parse(
    execFileSync("git", ["-C", live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  )
  const taken = []
  for (const _ of SLOT_IDS) taken.push(await acquire(repo, base))

  const stopped = new AbortController()
  const abandoned = acquire(repo, base, "", stopped.signal)
  stopped.abort("discarded")
  await expect(abandoned).rejects.toBeDefined()

  let waited = false
  const queued = acquire(repo, base).then((slot) => {
    waited = true
    return slot
  })
  await new Promise((resolve) => setTimeout(resolve, 600))
  expect(waited).toBe(false)
  await release(taken[1]!)
  const slot = await queued
  try {
    expect(slot.dir).toBe(taken[1]!.dir)
  } finally {
    for (const held of [taken[0]!, taken[2]!, slot]) await release(held)
  }
})

it("copies app-local dependencies into a slot without a root installation", async () => {
  const live = temp()
  const slot = temp()
  execFileSync("git", ["init", "-q", live])
  file(live, "apps/site/node_modules/tool/index.js", "app tool")
  await farm(live, slot, "apps/site")
  expect(readFileSync(join(slot, "apps/site/node_modules/tool/index.js"), "utf8")).toBe("app tool")
})
