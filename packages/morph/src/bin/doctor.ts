import { spawnSync } from "node:child_process"
import { constants, existsSync } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { delimiter, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { tsImport } from "tsx/esm/api"

import { MorphConfigInputSchema } from "../core/config"
import { commandAt } from "../bridge/checks"
import { configAt, openRepo } from "../bridge/git"

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function onPath(bin: string): Promise<boolean> {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (await executable(join(dir || ".", bin))) return true
  }
  return false
}

async function contents(path: string): Promise<string> {
  return readFile(path, "utf8").catch(() => "")
}

/** Check local prerequisites and recognizable Next wiring without changing source files. */
export async function doctor(app: string): Promise<boolean> {
  let failures = 0
  const check = (ok: boolean, name: string, fix: string) => {
    console.log(`${ok ? "ok" : "FAIL"} ${name}${ok ? "" : `: ${fix}`}`)
    if (!ok) failures++
  }
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number)
  check(
    major === 22 ? minor >= 18 : major === 24 ? minor >= 11 : major > 24,
    "Node.js",
    "Use Node.js ^22.18.0 or >=24.11.0 (required by the parser).",
  )
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: app, encoding: "utf8" })
  const root = git.status === 0 ? resolve(git.stdout.trim()) : app
  check(
    git.status === 0,
    "git checkout",
    "Run from an app inside a Git checkout with git installed.",
  )
  check(
    await onPath("claude"),
    "claude executable",
    "Install Claude Code and make claude available on PATH.",
  )

  const configs = ["ts", "js", "mjs"]
    .map((ext) => join(app, `morph.config.${ext}`))
    .filter(existsSync)
  check(
    configs.length === 1,
    "Morph config",
    "Create exactly one morph.config.ts, morph.config.js, or morph.config.mjs in the app root.",
  )
  const configPath = configs[0]
  if (configs.length === 1 && configPath !== undefined) {
    try {
      const loaded = await tsImport(pathToFileURL(configPath).href, import.meta.url)
      const value: unknown = loaded.default
      const input =
        typeof value === "object" && value !== null && "default" in value ? value.default : value
      const parsed = MorphConfigInputSchema.safeParse(input)
      if (!parsed.success) {
        check(
          false,
          "Morph config validation",
          `Fix ${configPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
        )
      } else {
        const config =
          git.status === 0 ? configAt(await openRepo(app), app, parsed.data) : parsed.data
        check(true, "Morph config validation", "")
        for (const [name, command] of Object.entries(config.checks)) {
          if (command === null) continue
          check(
            await executable(
              commandAt(root, relative(root, app), relative(root, app), command.bin),
            ),
            `tool ${name} (${command.bin})`,
            `Install ${command.bin} in the app or repository node_modules/.bin.`,
          )
        }
      }
    } catch (error) {
      check(
        false,
        "Morph config loading",
        `Fix ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const viteConfig = ["ts", "js", "mjs", "cjs", "mts", "cts"].some((ext) =>
    existsSync(join(app, `vite.config.${ext}`)),
  )
  const nextConfigExists = ["ts", "js", "mjs", "cjs"].some((ext) =>
    existsSync(join(app, `next.config.${ext}`)),
  )
  if (viteConfig && !nextConfigExists) {
    console.log(
      "Vite wiring was not checked. Start the app to verify the bridge; build your app and inspect the output to verify production exclusion.",
    )
    return failures === 0
  }

  const apps = ["app", "src/app"].filter((dir) => existsSync(join(app, dir, "layout.tsx")))
  check(
    apps.length === 1,
    "Next App Router layout",
    "Use exactly one app/layout.tsx or src/app/layout.tsx, then run morph setup-next.",
  )
  const router = apps[0]
  if (apps.length === 1 && router !== undefined) {
    const route = await contents(join(app, router, "api/morph/[op]/route.dev.ts"))
    check(
      /from\s*["']@enitrat\/morph\/next["']/.test(route) &&
        /from\s*["'][^"']*morph\.config(?:\.[cm]?[jt]s)?["']/.test(route) &&
        /\bmorphRoute\s*\(/.test(route) &&
        /\bGET\b/.test(route) &&
        /\bPOST\b/.test(route),
      "Next route",
      `Wire morphRoute and its GET and POST exports in ${router}/api/morph/[op]/route.dev.ts; run morph setup-next for a starting point.`,
    )
    const mount = await contents(join(app, router, "morph-mount.tsx"))
    check(
      /@enitrat\/morph\/widget/.test(mount) && /NODE_ENV/.test(mount) && /development/.test(mount),
      "Next mount",
      `Create a development-only widget mount in ${router}/morph-mount.tsx; run morph setup-next for a starting point.`,
    )
    const layout = await contents(join(app, router, "layout.tsx"))
    check(
      /\bimport\b[\s\S]*?\bMorphMount\b[\s\S]*?from\s*["']\.\/morph-mount["']/.test(layout) &&
        /<MorphMount(?:\s|\/|>)/.test(layout),
      "Next layout mount",
      `Import and render MorphMount inside ${router}/layout.tsx.`,
    )
  }
  const nextConfigs = ["ts", "js", "mjs", "cjs"].map((ext) => join(app, `next.config.${ext}`))
  const nextConfig = (await Promise.all(nextConfigs.map(contents))).join("\n")
  check(
    /pageExtensions/.test(nextConfig) &&
      /dev\.ts/.test(nextConfig) &&
      /NODE_ENV/.test(nextConfig) &&
      /development/.test(nextConfig),
    "Next dev-only route configuration",
    'Configure pageExtensions to include "dev.ts" only in development; see the Morph README.',
  )
  console.log(
    "Next wiring checks inspect source text only. Start the app to verify the bridge and build your app and inspect the output to verify production exclusion.",
  )
  return failures === 0
}
