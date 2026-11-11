import { tmpdir } from "node:os"

import { expect, it } from "vitest"

import { runCommand } from "./command"

it("returns startup failures as values", async () => {
  expect(
    await runCommand("/nonexistent-morph-command", [], {
      cwd: tmpdir(),
      signal: AbortSignal.any([]),
    }),
  ).toMatchObject({ kind: "failed", detail: expect.stringContaining("ENOENT") })
})

it("collects output and retains the command's exit status", async () => {
  const stop = new AbortController()
  const result = await runCommand(
    process.execPath,
    ["-e", 'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 7'],
    { cwd: tmpdir(), signal: stop.signal },
  )
  expect(result).toMatchObject({ kind: "exited", code: 7, stdout: "out", stderr: "err" })
  stop.abort("after completion")
})

it("returns a closed input pipe as a failure and waits for the command to end", async () => {
  const result = await runCommand(
    process.execPath,
    ["-e", 'require("node:fs").closeSync(0); setInterval(() => {}, 1000)'],
    { cwd: tmpdir(), signal: AbortSignal.timeout(5000), input: "x".repeat(2_000_000) },
  )
  expect(result).toMatchObject({ kind: "failed", detail: expect.stringContaining("EPIPE") })
})

it("returns synchronous launch failures as values", async () => {
  expect(
    await runCommand("git", ["bad\0arg"], { cwd: tmpdir(), signal: AbortSignal.any([]) }),
  ).toMatchObject({ kind: "failed", detail: expect.stringContaining("null bytes") })
})
