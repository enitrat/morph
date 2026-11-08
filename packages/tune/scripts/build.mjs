import { build } from "esbuild"
import { copyFile, mkdir, readFile, rm } from "node:fs/promises"

import { uiCss } from "./ui-css.mjs"

await rm("dist", { recursive: true, force: true })

const shared = {
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir: "dist",
}

// The widget bundles its dev dependencies (motion) so it never shares an instance with the app's.
const pkg = JSON.parse(await readFile("package.json", "utf8"))
const runtime = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })

await Promise.all([
  build({
    ...shared,
    packages: "external",
    platform: "node",
    entryPoints: {
      config: "src/core/config.ts",
      next: "src/next/index.ts",
      vite: "src/vite/index.js",
      runner: "src/bridge/runner.ts",
      tune: "src/bin/tune.ts",
    },
  }),
  build({
    ...shared,
    external: runtime.flatMap((name) => [name, `${name}/*`]),
    platform: "browser",
    entryPoints: { widget: "src/widget/index.tsx" },
    banner: { js: '"use client";' },
    define: { __TUNE_UI_CSS__: JSON.stringify(await uiCss()) },
  }),
])

await mkdir("dist/types/vite", { recursive: true })
await copyFile("src/vite/index.d.ts", "dist/types/vite/index.d.ts")
