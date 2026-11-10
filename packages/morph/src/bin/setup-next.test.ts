import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { setupNext } from "./setup-next"

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function fixture(app: string) {
  const dir = await mkdtemp(join(tmpdir(), "morph-setup-"))
  dirs.push(dir)
  await mkdir(join(dir, app), { recursive: true })
  await writeFile(join(dir, app, "layout.tsx"), "layout")
  await writeFile(join(dir, "morph.config.ts"), "config")
  return dir
}

it("creates correct imports for src/app and can be run twice", async () => {
  const dir = await fixture("src/app")
  await setupNext(dir)
  await setupNext(dir)
  expect(await readFile(join(dir, "src/app/api/morph/[op]/route.dev.ts"), "utf8")).toContain(
    'from "../../../../../morph.config"',
  )
  expect(await readFile(join(dir, "src/app/morph-mount.tsx"), "utf8")).toContain(
    'process.env.NODE_ENV === "development"',
  )
})

it("refuses existing different files without creating the other file", async () => {
  const dir = await fixture("app")
  await writeFile(join(dir, "app/morph-mount.tsx"), "owned by app")
  await expect(setupNext(dir)).rejects.toThrow("already exists")
  await expect(readFile(join(dir, "app/api/morph/[op]/route.dev.ts"))).rejects.toMatchObject({
    code: "ENOENT",
  })
})

it("includes the extension for an mjs config", async () => {
  const dir = await fixture("app")
  await rm(join(dir, "morph.config.ts"))
  await writeFile(join(dir, "morph.config.mjs"), "export default {}")
  await setupNext(dir)
  expect(await readFile(join(dir, "app/api/morph/[op]/route.dev.ts"), "utf8")).toContain(
    'from "../../../../morph.config.mjs"',
  )
})
