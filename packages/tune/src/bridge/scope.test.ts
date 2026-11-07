import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { RepoPath } from "../variant/model"
import { breachesIn, DESIGNER, resolverAt } from "./scope"
import { REPO } from "./test-fixtures"

const PLAYGROUND = "packages/ui/src/components/atoms/button/examples/playground.tsx"
const paths = (...list: string[]) => list.map((path) => RepoPath.parse(path))
const resolve = resolverAt(REPO)

const added = (path: string, start: number, ...lines: string[]) =>
  [
    `+++ b/${path}`,
    `@@ -0,0 +${start},${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n")

describe("what a variant may not touch", () => {
  it("refuses the confetti-js variant: a manifest, a module shim and an import of a missing package", () => {
    const diff = [
      added(
        PLAYGROUND,
        5,
        'import confetti from "confetti-js"',
        'import { Button } from "@acme/ui"',
      ),
      added("packages/ui/src/confetti-js.d.ts", 1, 'declare module "confetti-js"'),
    ].join("\n")
    const touched = paths(
      "packages/ui/package.json",
      PLAYGROUND,
      "packages/ui/src/confetti-js.d.ts",
    )
    const breaches = breachesIn(diff, touched, resolve, ["@acme/ui"])
    expect(breaches.map(({ path, line, kind }) => `${path}:${line} ${kind}`)).toEqual([
      "packages/ui/package.json:1 package",
      "packages/ui/src/confetti-js.d.ts:1 package",
      `${PLAYGROUND}:5 package`,
      "packages/ui/src/confetti-js.d.ts:1 package",
    ])
    expect(new Set(breaches.map((breach) => DESIGNER[breach.kind]))).toEqual(
      new Set(["Variants can't add packages. Ask for it with what the design system has."]),
    )
  })

  it("refuses lockfiles and build config, and lets ordinary source through", () => {
    const touched = paths(
      "pnpm-lock.yaml",
      "apps/site/tsconfig.json",
      "apps/site/next.config.mjs",
      "apps/site/vite.config.ts",
      "apps/site/app/page.tsx",
      "packages/ui/src/components/atoms/button/button.tokens.css",
    )
    expect(
      breachesIn("", touched, resolve, ["@acme/ui"]).map(({ path, kind }) => `${path} ${kind}`),
    ).toEqual([
      "pnpm-lock.yaml package",
      "apps/site/tsconfig.json build",
      "apps/site/next.config.mjs build",
      "apps/site/vite.config.ts build",
    ])
  })

  it("resolves what the importing workspace has: its deps, itself, its aliases, its files", () => {
    const diff = [
      added(
        PLAYGROUND,
        1,
        'import { CheckIcon } from "lucide-react"',
        'import { type PlaygroundProps } from "@acme/ui/meta"',
        'import { type meta } from "../button.meta"',
        'import { join } from "node:path"',
      ),
      added("apps/site/app/layout.tsx", 3, 'import { AppFrame } from "@/components/app-frame"'),
    ].join("\n")
    expect(breachesIn(diff, [], resolve, ["@acme/ui"])).toEqual([])
  })

  it("names an import of a file that does not exist, and ignores removed lines", () => {
    const diff = [
      added(PLAYGROUND, 7, 'import { Sparkle } from "./sparkle"'),
      "@@ -9 +7,0 @@",
      '-import gone from "left-pad"',
    ].join("\n")
    expect(breachesIn(diff, [], resolve, ["@acme/ui"])).toEqual([
      {
        path: PLAYGROUND,
        line: 7,
        kind: "missing",
        detail: '"./sparkle" names no file. Import a module that exists.',
      },
    ])
  })

  it("refuses a package another workspace has but this one does not list", () => {
    const diff = added(PLAYGROUND, 2, 'import useSWR from "swr"')
    expect(breachesIn(diff, [], resolve, ["@acme/ui"]).map((breach) => breach.kind)).toEqual([
      "package",
    ])
  })

  it("reads the manifest of the nearest workspace, wherever the repo keeps it", () => {
    const root = mkdtempSync(join(tmpdir(), "tune-scope-"))
    const files = {
      "package.json": JSON.stringify({ name: "root", devDependencies: { oxlint: "1" } }),
      "sites/docs/package.json": JSON.stringify({ name: "docs", dependencies: { react: "19" } }),
      "sites/docs/app/page.tsx": "",
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const diff = added("sites/docs/app/page.tsx", 1, 'import { useState } from "react"')
    const oxlint = added("sites/docs/app/page.tsx", 2, 'import "oxlint"')
    try {
      expect(breachesIn(diff, [], resolverAt(root), [])).toEqual([])
      expect(breachesIn(oxlint, [], resolverAt(root), []).map((breach) => breach.kind)).toEqual([
        "package",
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
