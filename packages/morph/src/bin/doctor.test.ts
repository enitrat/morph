import { execFileSync, spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"

const dirs: string[] = []
const cli = fileURLToPath(new URL("./morph.ts", import.meta.url))
const tsx = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url))

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "morph-doctor-"))
  dirs.push(dir)
  execFileSync("git", ["init", "-q", dir])
  const app = join(dir, "src/app")
  const bin = join(dir, "node_modules/.bin")
  await mkdir(join(app, "api/morph/[op]"), { recursive: true })
  await mkdir(bin, { recursive: true })
  for (const name of ["claude", "formatter", "typechecker"]) {
    await writeFile(join(bin, name), "#!/bin/sh\nexit 0\n")
    await chmod(join(bin, name), 0o755)
  }
  await writeFile(
    join(dir, "morph.config.ts"),
    `export default {
    tokens: { kind: "css", files: ["styles.css"], themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] } },
    components: [], plumbing: [], checks: { lint: null, format: { bin: "formatter", args: [] }, typecheck: { bin: "typechecker", args: [], scope: "root" } }
  }`,
  )
  await writeFile(
    join(app, "layout.tsx"),
    'import { MorphMount } from "./morph-mount"\nexport default () => <body><MorphMount /></body>',
  )
  await writeFile(
    join(app, "morph-mount.tsx"),
    'process.env.NODE_ENV === "development" && import("@enitrat/morph/widget")',
  )
  await writeFile(
    join(app, "api/morph/[op]/route.dev.ts"),
    'import { morphRoute } from "@enitrat/morph/next"; import config from "../../../../../morph.config"; export const { GET, POST } = morphRoute(config)',
  )
  await writeFile(
    join(dir, "next.config.mjs"),
    'const dev = process.env.NODE_ENV === "development"; export default { pageExtensions: dev ? ["dev.ts"] : undefined }',
  )
  return { dir, app, bin }
}

function run(dir: string, bin: string) {
  return spawnSync(process.execPath, [tsx, cli, "doctor"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
  })
}

it("checks a configured src/app through the CLI without changing files", async () => {
  const { dir, app, bin } = await fixture()
  const before = await readFile(join(app, "layout.tsx"), "utf8")
  const result = run(dir, bin)
  expect(result.stderr).toBe("")
  expect(result.status, result.stdout).toBe(0)
  expect(result.stdout).toContain("ok Morph config validation")
  expect(result.stdout).toContain("source text only")
  expect(await readFile(join(app, "layout.tsx"), "utf8")).toBe(before)
})

it("reports missing config, tools and layout wiring with nonzero exit", async () => {
  const { dir, app, bin } = await fixture()
  await rm(join(bin, "formatter"))
  await writeFile(join(app, "layout.tsx"), "export default () => <body />")
  let result = run(dir, bin)
  expect(result.status).toBe(1)
  expect(result.stdout).toContain("FAIL tool format (formatter)")
  expect(result.stdout).toContain("FAIL Next layout mount")
  await rm(join(dir, "morph.config.ts"))
  result = run(dir, bin)
  expect(result.status).toBe(1)
  expect(result.stdout).toContain("FAIL Morph config:")
})

it("checks common Vite prerequisites without claiming to verify its wiring", async () => {
  const { dir, app, bin } = await fixture()
  await rm(app, { recursive: true })
  await rm(join(dir, "next.config.mjs"))
  await writeFile(join(dir, "vite.config.ts"), "export default {}")
  const result = run(dir, bin)
  expect(result.stderr).toBe("")
  expect(result.status, result.stdout).toBe(0)
  expect(result.stdout).toContain("ok Morph config validation")
  expect(result.stdout).toContain("Vite wiring was not checked")
  expect(result.stdout).not.toContain("Next App Router")
  expect(result.stdout).not.toContain("check:prod")
  await rm(join(bin, "formatter"))
  const failed = run(dir, bin)
  expect(failed.status).toBe(1)
  expect(failed.stdout).toContain("FAIL tool format (formatter)")
})
