import { build } from "esbuild"
import { copyFile, mkdir, rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })

const shared = {
  bundle: true,
  format: "esm",
  packages: "external",
  target: "es2022",
  outdir: "dist",
}

await Promise.all([
  build({
    ...shared,
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
    platform: "browser",
    entryPoints: { widget: "src/widget/index.tsx" },
    banner: { js: '"use client";' },
  }),
])

await mkdir("dist/types/vite", { recursive: true })
await copyFile("src/vite/index.d.ts", "dist/types/vite/index.d.ts")
