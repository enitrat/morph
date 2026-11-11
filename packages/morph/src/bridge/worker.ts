// oxlint-disable-next-line import/no-nodejs-modules -- starts detached bridge workers.
import { spawn } from "node:child_process"
// oxlint-disable-next-line import/no-nodejs-modules -- worker logs outlive the HTTP request.
import { mkdir, open } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- resolves worker entrypoints and logs.
import { dirname, join } from "node:path"

import { packageDir } from "./package"

/** Starts a worker and reports its PID before releasing the caller's publication lock. */
export async function launchWorker(
  entry: "runner" | "planner-runner",
  args: readonly string[],
  path: string,
): Promise<{ ok: true; pid: number } | { ok: false; reason: string }> {
  try {
    const pkg = packageDir()
    await mkdir(dirname(path), { recursive: true })
    const log = await open(path, "a")
    try {
      return await new Promise((resolve) => {
        const child = spawn(process.execPath, [join(pkg, "dist", `${entry}.js`), ...args], {
          cwd: pkg,
          detached: true,
          stdio: ["ignore", log.fd, log.fd],
        })
        child.once("error", (cause) => resolve({ ok: false, reason: cause.message }))
        child.once("spawn", () => {
          child.unref()
          resolve(
            child.pid === undefined
              ? { ok: false, reason: "No worker process id" }
              : { ok: true, pid: child.pid },
          )
        })
      })
    } finally {
      await log.close()
    }
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
  }
}
