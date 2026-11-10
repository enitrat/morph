import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, expect, it } from "vitest"
import { z } from "zod"

import { runClaude } from "./agent"
import { alive } from "./lock"

const TRANSCRIPT = [
  { type: "system", subtype: "init" },
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Editing." },
        { type: "tool_use", name: "Write", input: { file_path: "/slot/src/new.tsx", content: "" } },
      ],
    },
  },
  { type: "user", message: { content: [] } },
  {
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", name: "Read", input: { file_path: "/live/src/card.tsx" } },
        {
          type: "tool_use",
          name: "Edit",
          input: { file_path: "../live/src/card.tsx", old_string: "a", new_string: "b" },
        },
      ],
    },
  },
  { type: "result", subtype: "success", is_error: false, structured_output: { title: "Rows" } },
]

let bin: string
let path: string | undefined
beforeEach(() => {
  bin = realpathSync(mkdtempSync(join(tmpdir(), "morph-agent-")))
  const lines = TRANSCRIPT.map((event) => JSON.stringify(event)).join("\n")
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ncat > /dev/null\ncat <<'EOF'\n${lines}\nEOF\n`)
  chmodSync(join(bin, "claude"), 0o755)
  path = process.env.PATH
  process.env.PATH = `${bin}:${path}`
})
afterEach(() => {
  process.env.PATH = path
  rmSync(bin, { recursive: true, force: true })
})

it("answers the structured output with every path the edit tools wrote, reads excluded", async () => {
  const answer = await runClaude(
    "change it",
    z.object({ title: z.string() }),
    AbortSignal.any([]),
    { cwd: bin, model: "sonnet", tools: ["Read", "Edit", "Write"], deadlineMs: 10_000 },
  )

  expect(answer).toEqual({
    ok: true,
    value: { title: "Rows" },
    writes: ["/slot/src/new.tsx", "../live/src/card.tsx"],
  })
})

it("fails a run whose edit tool names no file, since where it wrote is unknown", async () => {
  const pathless = {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", input: { old_string: "a" } }] },
  }
  const lines = [...TRANSCRIPT.slice(0, 2), pathless, TRANSCRIPT.at(-1)]
    .map((event) => JSON.stringify(event))
    .join("\n")
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ncat > /dev/null\ncat <<'EOF'\n${lines}\nEOF\n`)

  const answer = await runClaude(
    "change it",
    z.object({ title: z.string() }),
    AbortSignal.any([]),
    { cwd: bin, model: "sonnet", tools: ["Read", "Edit", "Write"], deadlineMs: 10_000 },
  )

  expect(answer.ok).toBe(false)
})

it("stops every process the run started when it is stopped", async () => {
  const pidFile = join(bin, "child.pid")
  writeFileSync(join(bin, "claude"), `#!/bin/sh\nsleep 30 &\necho $! > ${pidFile}\nwait\n`)
  const stop = new AbortController()
  const running = runClaude("plan", z.object({}), stop.signal, {
    model: "sonnet",
    deadlineMs: 10_000,
  })
  await expect.poll(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim()).toBeTruthy()
  const child = Number(readFileSync(pidFile, "utf8"))
  stop.abort("cancelled")

  expect(await running).toEqual({ ok: false, detail: "stopped: cancelled" })
  await expect.poll(() => alive(child)).toBe(false)
})
