import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  cpSync,
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

import { afterEach, describe, expect, it, vi } from "vitest"

import { operations } from "../protocol"
import { RepoPath, SessionId } from "../variant/model"
import { propControls } from "./controls"
import { writeJson } from "./disk"
import config from "./fixtures/acme/tune.config"
import { homeOf } from "./git"
import { tuneHandler } from "./handler"
import { componentUses, writeProp } from "./props"
import { MODULES, openHost, REPO, SPAWNING_TEST_MS } from "./test-fixtures"

vi.setConfig({ testTimeout: SPAWNING_TEST_MS })

const BUTTON = "packages/ui/src/components/atoms/button"
const PAGE = "apps/site/app/page.tsx"
const PAGE_SOURCE = `export function Page({ tone }) {
  return (
    <div>
      <Button size="sm">Save</Button>
      <Button variant={tone}>Edit</Button>
    </div>
  )
}
`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" })

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tune-props-")))
  dirs.push(root)
  for (const path of [BUTTON, "packages/ui/src/meta.ts", ".oxfmtrc.json"])
    cpSync(join(REPO, path), join(root, path), { recursive: true })
  mkdirSync(dirname(join(root, PAGE)), { recursive: true })
  writeFileSync(join(root, PAGE), PAGE_SOURCE)
  symlinkSync(MODULES, join(root, "node_modules"))
  sh(root, "init", "--quiet")
  sh(root, "config", "user.email", "tune@example.com")
  sh(root, "config", "user.name", "Tune")
  sh(root, "add", "-A")
  sh(root, "commit", "--quiet", "-m", "base")
  return { root, repo: await openHost(root) }
}

const site = { path: RepoPath.parse(PAGE), line: 4, col: 7 }
const write = { site, tag: "Button", component: "Button" } as const
const changed = (root: string) =>
  sh(root, "diff", "--unified=0", "--no-color")
    .split("\n")
    .filter((line) => /^[-+] /.test(line))

describe("writing a prop", () => {
  it("offers the enum and boolean props of the component's lab controls", async () => {
    const { repo } = await fixture()
    const controls = await propControls(repo, "Button")
    expect(controls.map(({ name }) => name)).toEqual([
      "variant",
      "size",
      "press",
      "loading",
      "disabled",
    ])
    expect(await propControls(repo, "Page")).toEqual([])
  })

  it("adds, replaces and removes one attribute at the call site, formatted", async () => {
    const { root, repo } = await fixture()

    const added = await writeProp(repo, { ...write, name: "variant", to: "secondary" })
    expect(added).toEqual({ ok: true, value: { changed: true, site } })
    expect(changed(root)).toEqual([
      '-      <Button size="sm">Save</Button>',
      "+      <Button",
      '+        variant="secondary"',
      '+        size="sm"',
      "+      >",
      "+        Save",
      "+      </Button>",
    ])

    await writeProp(repo, { ...write, name: "size", to: "lg" })
    await writeProp(repo, { ...write, name: "variant", to: null })
    expect(changed(root)).toEqual([
      '-      <Button size="sm">Save</Button>',
      '+      <Button size="lg">Save</Button>',
    ])
  })

  it("keeps an applied edit and reports a formatter failure through the handler", async () => {
    const { root } = await fixture()
    const handle = tuneHandler(
      { ...config, checks: { ...config.checks, format: { bin: "missing-formatter", args: [] } } },
      { dir: root, bundler: { symbolicate: async () => [] } },
    )
    vi.stubEnv("NODE_ENV", "development")
    try {
      const response = await handle(
        new Request("http://localhost:3000/api/tune/prop", {
          method: "POST",
          headers: { host: "localhost:3000", "x-tune": "1" },
          body: JSON.stringify({ ...write, name: "size", to: "lg" }),
        }),
        "prop",
      )
      expect(response.status).toBe(200)
      expect(operations.prop.response.parse(await response.json())).toEqual({
        changed: true,
        site,
        warning: expect.stringContaining("formatting failed"),
      })
      expect(readFileSync(join(root, PAGE), "utf8")).toBe(
        PAGE_SOURCE.replace('size="sm"', 'size="lg"'),
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("does not format an unchanged prop through the handler", async () => {
    const { root } = await fixture()
    const handle = tuneHandler(
      { ...config, checks: { ...config.checks, format: { bin: "missing-formatter", args: [] } } },
      { dir: root, bundler: { symbolicate: async () => [] } },
    )
    vi.stubEnv("NODE_ENV", "development")
    try {
      const response = await handle(
        new Request("http://localhost:3000/api/tune/prop", {
          method: "POST",
          headers: { host: "localhost:3000", "x-tune": "1" },
          body: JSON.stringify({ ...write, name: "size", to: "sm" }),
        }),
        "prop",
      )
      expect(response.status).toBe(200)
      expect(operations.prop.response.parse(await response.json())).toEqual({
        changed: false,
        site,
      })
      expect(readFileSync(join(root, PAGE), "utf8")).toBe(PAGE_SOURCE)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("keeps source read failures as HTTP crashes with their original detail", async () => {
    const { root } = await fixture()
    rmSync(join(root, PAGE))
    mkdirSync(join(root, PAGE))
    const handle = tuneHandler(config, {
      dir: root,
      bundler: { symbolicate: async () => [] },
    })
    vi.stubEnv("NODE_ENV", "development")
    try {
      const response = await handle(
        new Request("http://localhost:3000/api/tune/prop", {
          method: "POST",
          headers: { host: "localhost:3000", "x-tune": "1" },
          body: JSON.stringify({ ...write, name: "size", to: "lg" }),
        }),
        "prop",
      )
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { kind: "crashed", detail: expect.stringContaining("EISDIR") },
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("refuses a value the controls do not offer, and a prop the code computes", async () => {
    const { root, repo } = await fixture()
    const unknown = await writeProp(repo, { ...write, name: "variant", to: "huge" })
    const computed = await writeProp(repo, {
      ...write,
      site: { ...site, line: 5 },
      name: "variant",
      to: "ghost",
    })
    expect(unknown).toMatchObject({ ok: false, kind: "invalid" })
    expect(computed).toMatchObject({ ok: false, kind: "invalid" })
    expect(readFileSync(join(root, PAGE), "utf8")).toBe(PAGE_SOURCE)
  })

  it("refuses to write while a session is open", async () => {
    const { root, repo } = await fixture()
    const id = SessionId.parse(randomUUID())
    await writeJson(join(homeOf(repo), "sessions", id, "session.json"), {
      id,
      base: "0".repeat(40),
      ask: {
        id,
        words: "x",
        targets: [{ source: site, owner: [], text: "" }],
        marks: [],
        count: 1,
      },
      directions: [{ title: "X", description: "X." }],
    })

    const refused = await writeProp(repo, { ...write, name: "size", to: "lg" })

    expect(refused).toEqual({ ok: false, kind: "busy", session: id })
    expect(readFileSync(join(root, PAGE), "utf8")).toBe(PAGE_SOURCE)
  })
})

describe("counting a wrapper's uses", () => {
  const WRAPPER = "apps/site/components/save-button.tsx"
  const uses = {
    [WRAPPER]: `export function SaveButton() {\n  return <Button>Save</Button>\n}\nexport const Twice = () => <SaveButton />\n`,
    "apps/site/app/a/page.tsx": `import { SaveButton } from "@/components/save-button"\nexport default () => (\n  <div>\n    <SaveButton />\n    <SaveButton\n      size="lg"\n    >\n      x\n    </SaveButton>\n  </div>\n)\n`,
    "packages/ui/src/x/examples/demo.tsx": `import { SaveButton } from "@/components/save-button"\nexport const Demo = () => <SaveButton/>\n`,
    "apps/site/app/a/page.test.tsx": `import { SaveButton } from "@/components/save-button"\nrender(<SaveButton />)\n`,
    "apps/site/app/b/other.tsx": `function SaveButton() {}\nconst Namesake = () => <SaveButton />\nconst Longer = () => <SaveButtonGroup />\n`,
    "packages/ui/src/x/fixtures/app/page.tsx": `import { SaveButton } from "@/components/save-button"\nexport default () => [\n  <SaveButton />,\n  <SaveButton />,\n]\n`,
    "e2e/save.tsx": `import { SaveButton } from "@/components/save-button"\nmount(<SaveButton />)\n`,
    "tools/preview.tsx": `import { SaveButton } from "@/components/save-button"\nexport default () => <SaveButton />\n`,
  }

  it("counts JSX uses across the repo, lab examples apart, and leaves out test code and namesakes", async () => {
    const { root, repo } = await fixture()
    for (const [path, text] of Object.entries(uses)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }

    expect(await componentUses(repo, "SaveButton", WRAPPER)).toEqual({ uses: 4, examples: 1 })
    expect(await componentUses(repo, "Page", PAGE)).toEqual({ uses: 0, examples: 0 })
  })
})

it("counts a shadcn app's uses of a ui component outside apps and packages", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tune-uses-")))
  dirs.push(root)
  const files = {
    "src/components/ui/button.tsx": `export function Button(props) {\n  return <button {...props} />\n}\n`,
    "src/app/page.tsx": `import { Button } from "@/components/ui/button"\nexport default () => (\n  <div>\n    <Button>Save</Button>\n    <Button variant="outline">Edit</Button>\n  </div>\n)\n`,
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  sh(root, "init", "--quiet")

  const repo = { root, dir: join(root, ".git") }
  expect(await componentUses(repo, "Button", "src/components/ui/button.tsx")).toEqual({
    uses: 2,
    examples: 0,
  })
})
