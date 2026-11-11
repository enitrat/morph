import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { setTimeout as delay } from "node:timers/promises"
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

it("stops a child in the agent process group on cancellation", async () => {
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

it("cancels an agent and inherited child that both ignore SIGTERM", async () => {
  const parentFile = join(bin, "parent.pid")
  const childFile = join(bin, "resistant-child.pid")
  const code = `process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(${JSON.stringify(childFile)}, String(process.pid)); setInterval(() => {}, 1000)`
  writeFileSync(
    join(bin, "claude"),
    `#!/usr/bin/env node
const fs = require("node:fs")
process.on("SIGTERM", () => {})
fs.writeFileSync(${JSON.stringify(parentFile)}, String(process.pid))
require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(code)}], { stdio: "inherit" })
setInterval(() => {}, 1000)
`,
  )
  const stop = new AbortController()
  const running = runClaude("plan", z.object({}), stop.signal, {
    model: "sonnet",
    deadlineMs: 10_000,
  })
  try {
    await expect.poll(() => existsSync(childFile)).toBe(true)
    stop.abort("cancelled")
    const answer = await Promise.race([running, delay(1500).then(() => "still running")])
    expect(answer).toEqual({ ok: false, detail: "stopped: cancelled" })
    await expect.poll(() => alive(Number(readFileSync(childFile, "utf8")))).toBe(false)
  } finally {
    if (existsSync(parentFile)) {
      try {
        process.kill(-Number(readFileSync(parentFile, "utf8")), "SIGKILL")
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
      }
    }
    await running
  }
})

it("does not launch an agent for an already cancelled command", async () => {
  const started = join(bin, "started")
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ntouch '${started}'\n`)
  const stop = new AbortController()
  stop.abort("cancelled before start")
  expect(
    await runClaude("plan", z.object({}), stop.signal, { model: "sonnet", deadlineMs: 10_000 }),
  ).toEqual({ ok: false, detail: "stopped: cancelled before start" })
  expect(existsSync(started)).toBe(false)
})
