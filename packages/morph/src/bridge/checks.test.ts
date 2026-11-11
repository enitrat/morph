import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { RepoPath } from "../variant/model"
import { checks, deadLinksIn, reasonOf } from "./checks"
import { farm } from "./slots"
import { MorphConfig } from "../core/config"
import { CONFIG, MODULES } from "./test-fixtures"

describe("links a variant added that go nowhere", () => {
  it("names each added dead link by file and line, and ignores real and removed ones", () => {
    const diff = [
      "+++ b/apps/site/app/x.tsx",
      "@@ -10,0 +11,3 @@",
      '+      <Link href="#">Read more</Link>',
      '+      <Link href="/pricing">Pricing</Link>',
      "+      <a href={''}>Docs</a>",
      "@@ -20 +23,0 @@",
      '-      <Link href="#">Old</Link>',
    ].join("\n")
    expect(reasonOf(deadLinksIn(diff).join("\n")).split("\n")).toEqual([
      "x.tsx:11 This link goes nowhere. Link to a real route or leave the link out.",
      "x.tsx:13 This link goes nowhere. Link to a real route or leave the link out.",
    ])
  })
})

const LINT = [
  "oxlint:",
  "apps/site/app/x.tsx:4:11: warning react-doctor(no-static-element-interactions): Screen reader users can't tell this click handler is interactive. help: add a role.",
  "apps/site/app/x.tsx:2:9: error eslint(no-unused-vars): Variable 'unused' is declared but never used. help: Consider removing this declaration.",
  "apps/site/app/x.tsx:4:34: error jsx-a11y(alt-text): Missing `alt` attribute. help: Must have `alt` prop.",
  "apps/site/app/x.tsx:4:34: error jsx-a11y(alt-text): Missing `alt` attribute. help: Must have `alt` prop.",
].join("\n")

const TYPES = [
  "tsc in apps/site:",
  "app/x.tsx(3,9): error TS2322: Type 'string' is not assignable to type 'number'.",
].join("\n")

describe("the reason a variant failed its checks", () => {
  it("names the first errors by file and line, errors before warnings, each once", () => {
    expect(reasonOf(`${LINT}\n\n${TYPES}`).split("\n")).toEqual([
      "x.tsx:2 Variable 'unused' is declared but never used.",
      "x.tsx:4 Missing `alt` attribute.",
      "x.tsx:3 Type 'string' is not assignable to type 'number'.",
    ])
  })

  it("reads a type error alone", () => {
    expect(reasonOf(TYPES)).toBe("x.tsx:3 Type 'string' is not assignable to type 'number'.")
  })

  it("falls back to the output's first lines, never to a bare tool label", () => {
    expect(reasonOf("oxfmt:\nfailed to parse apps/site/app/x.tsx\nunexpected token")).toBe(
      "failed to parse apps/site/app/x.tsx\nunexpected token",
    )
  })
})

it.each(["root", "workspace"] as const)(
  "typechecks deleted imports in %s scope",
  async (scope) => {
    const root = mkdtempSync(join(tmpdir(), "morph-checks-"))
    const project = scope === "root" ? "" : "packages/ui/"
    try {
      const files: Record<string, string> = {
        "package.json": '{"name":"root"}',
        [`${project}tsconfig.json`]:
          '{"compilerOptions":{"noEmit":true,"skipLibCheck":true,"noUncheckedSideEffectImports":true}}',
        [`${project}src/index.ts`]: 'import "./deleted"',
        [`${project}src/deleted.ts`]: "export const value = 1",
      }
      if (project !== "") files[`${project}package.json`] = '{"name":"ui"}'
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), text)
      }
      symlinkSync(MODULES, join(root, "node_modules"))
      execFileSync("git", ["init", "-q"], { cwd: root })
      execFileSync("git", ["add", "."], { cwd: root })
      execFileSync(
        "git",
        ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"],
        { cwd: root },
      )
      unlinkSync(join(root, project, "src/deleted.ts"))
      const result = await checks(
        root,
        [RepoPath.parse(`${project}src/deleted.ts`)],
        {
          ...CONFIG,
          checks: { ...CONFIG.checks, typecheck: { bin: "tsc", args: ["--noEmit"], scope } },
        },
        AbortSignal.any([]),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors).toContain("deleted")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
  30_000,
)

it("checks transitive dependents using dependency fields", async () => {
  const root = mkdtempSync(join(tmpdir(), "morph-dependents-"))
  try {
    const files: Record<string, string> = {
      "package.json": '{"name":"root"}',
      "packages/a/package.json": '{"name":"a"}',
      "packages/b/package.json": '{"name":"b","dependencies":{"a":"*"}}',
      "packages/c/package.json": '{"name":"c","devDependencies":{"b":"*"}}',
      "packages/unrelated/package.json": '{"name":"other","description":"a"}',
      "packages/a/src/deleted.ts": "export {}",
      ...Object.fromEntries(
        ["a", "b", "c", "unrelated"].map((name) => [`packages/${name}/tsconfig.json`, "{}"]),
      ),
      "node_modules/.bin/check-project": '#!/bin/sh\necho "checked $(basename "$PWD")"\nexit 1\n',
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(
        join(root, path),
        text,
        path.endsWith("check-project") ? { mode: 0o755 } : undefined,
      )
    }
    execFileSync("git", ["init", "-q"], { cwd: root })
    execFileSync("git", ["add", "-f", "."], { cwd: root })
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"],
      { cwd: root },
    )
    unlinkSync(join(root, "packages/a/src/deleted.ts"))
    const result = await checks(
      root,
      [RepoPath.parse("packages/a/src/deleted.ts")],
      {
        ...CONFIG,
        checks: {
          ...CONFIG.checks,
          typecheck: { bin: "check-project", args: [], scope: "workspace" },
        },
      },
      AbortSignal.any([]),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain("checked a")
      expect(result.errors).toContain("checked b")
      expect(result.errors).toContain("checked c")
      expect(result.errors).not.toContain("checked unrelated")
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

it("uses app-local commands and paths in the checkout being checked", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "morph-app-checks-")))
  const live = join(parent, "live")
  const root = join(parent, "slot")
  mkdirSync(live)
  try {
    const app = "apps/site"
    const files: Record<string, string> = {
      "package.json": '{"name":"root"}',
      [`${app}/src/page.tsx`]: "export const value = 1\n",
      "shared/button.tsx": "export const button = 2\n",
      [`${app}/node_modules/.bin/format-local`]:
        '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@" > format-result\n',
      [`${app}/node_modules/.bin/check-local`]: '#!/bin/sh\nprintf "%s\\n" "$PWD" > check-result\n',
    }
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(live, path)), { recursive: true })
      writeFileSync(join(live, path), content, { mode: 0o755 })
    }
    execFileSync("git", ["init", "-q"], { cwd: live })
    execFileSync("git", ["add", "-f", "."], { cwd: live })
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"],
      { cwd: live },
    )
    execFileSync("git", ["worktree", "add", "--detach", root, "HEAD"], { cwd: live })
    rmSync(join(root, app, "node_modules"), { recursive: true, force: true })
    await farm(live, root, app)
    const config = MorphConfig.parse(
      JSON.parse(
        JSON.stringify({
          ...CONFIG,
          appRoot: app,
          pathBase: "repo",
          checks: {
            lint: null,
            format: { bin: "format-local", args: [] },
            typecheck: { bin: "check-local", args: [], scope: "app" },
          },
        }),
      ),
    )
    const result = await checks(
      root,
      [RepoPath.parse(`${app}/src/page.tsx`), RepoPath.parse("shared/button.tsx")],
      config,
      AbortSignal.any([]),
    )
    expect(result).toEqual({ ok: true })
    expect(
      readFileSync(join(root, app, "format-result"), "utf8")
        .trim()
        .split("\n"),
    ).toEqual([join(root, app), "src/page.tsx", join(root, "shared/button.tsx")])
    expect(readFileSync(join(root, app, "check-result"), "utf8").trim()).toBe(join(root, app))
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

it("finishes an in-flight Git index update before returning cancellation", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "morph-check-cancel-")))
  const sh = (...args: string[]) => execFileSync("git", args, { cwd: root })
  let monitor: ReturnType<typeof setInterval> | undefined
  try {
    sh("init", "-q")
    writeFileSync(join(root, "base"), "base")
    sh("add", ".")
    sh("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture")
    const paths = Array.from({ length: 6000 }, (_, i) => RepoPath.parse(`file${i}.tsx`))
    for (const path of paths) writeFileSync(join(root, path), "export const value = 1\n")
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true })
    writeFileSync(join(root, "node_modules", ".bin", "format"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    })
    const config = MorphConfig.parse({
      ...CONFIG,
      checks: {
        lint: null,
        format: { bin: "format", args: [] },
        typecheck: { bin: "unused", args: [], scope: "workspace" },
      },
    })
    const stop = new AbortController()
    const lock = join(root, ".git", "index.lock")
    monitor = setInterval(() => {
      if (existsSync(lock)) stop.abort("during git add")
    }, 1)
    const result = await checks(root, paths, config, stop.signal)
    expect(stop.signal.aborted).toBe(true)
    expect(result).toMatchObject({ ok: false, reason: "Checks cancelled" })
    expect(existsSync(lock)).toBe(false)
    sh("checkout", "--quiet", "--detach", "--force", "HEAD")
  } finally {
    clearInterval(monitor)
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)
