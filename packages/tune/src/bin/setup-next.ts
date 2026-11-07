import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join, relative } from "node:path"

/** Create the development-only Next route and mount without replacing existing files. */
export async function setupNext(root: string): Promise<void> {
  const apps = ["app", "src/app"].filter((dir) => existsSync(join(root, dir, "layout.tsx")))
  if (apps.length !== 1)
    throw new Error("Expected exactly one app/layout.tsx or src/app/layout.tsx.")
  const configExt = ["ts", "js", "mjs"].find((ext) => existsSync(join(root, `tune.config.${ext}`)))
  if (configExt === undefined) {
    throw new Error(
      "Create tune.config.ts at the app root first. See the Tune README for its shape.",
    )
  }
  const app = apps[0]
  if (app === undefined) throw new Error("No Next App Router layout found.")
  const route = join(app, "api/tune/[op]/route.dev.ts")
  const mount = join(app, "tune-mount.tsx")
  const configPath = relative(
    dirname(route),
    `tune.config${configExt === "mjs" ? ".mjs" : ""}`,
  ).replaceAll("\\", "/")
  const files = [
    [
      route,
      `import { tuneRoute } from "@enitrat/tune/next"\n\nimport config from "${configPath}"\n\nexport const { GET, POST, OPTIONS } = tuneRoute(config)\n`,
    ],
    [
      mount,
      `"use client"\n\nimport dynamic from "next/dynamic"\n\nexport const TuneMount =\n  process.env.NODE_ENV === "development"\n    ? dynamic(\n        () =>\n          import("@enitrat/tune/widget").then(({ TuneWidget }) => () => (\n            <TuneWidget base="/api/tune" />\n          )),\n        { ssr: false },\n      )\n    : () => null\n`,
    ],
  ] as const
  for (const [path, contents] of files) {
    const existing = await readFile(join(root, path), "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null
        throw error
      },
    )
    if (existing !== null && existing !== contents)
      throw new Error(`${path} already exists and differs. No files were changed.`)
  }
  for (const [path, contents] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), contents, { flag: "wx" }).catch(
      async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST" || (await readFile(join(root, path), "utf8")) !== contents)
          throw error
      },
    )
  }
  console.log(`Tune files are ready in ${app}.`)
  console.log(
    `Add import { TuneMount } from "./tune-mount" to ${app}/layout.tsx and render <TuneMount /> inside <body>.`,
  )
  console.log(
    'In next.config, include "dev.ts" in pageExtensions only during development. See the Tune README.',
  )
}
