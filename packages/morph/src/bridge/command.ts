// oxlint-disable-next-line import/no-nodejs-modules -- owns the bridge's external commands.
import { spawn } from "node:child_process"

type CommandResult =
  | { kind: "exited"; code: number | null; stdout: string; stderr: string; output: string }
  | { kind: "stopped"; detail: string }
  | { kind: "failed"; detail: string }

/** Stops the owned process group on cancellation and waits for its child and pipes to close. */
export async function runCommand(
  bin: string,
  args: readonly string[],
  { cwd, signal, input }: { cwd: string; signal: AbortSignal; input?: string },
): Promise<CommandResult> {
  if (signal.aborted) return Promise.resolve({ kind: "stopped", detail: String(signal.reason) })
  try {
    return await new Promise<CommandResult>((resolve) => {
      const child = spawn(bin, args, { cwd, detached: true })
      const chunks: { stream: "stdout" | "stderr"; bytes: Buffer }[] = []
      let failure: Error | undefined
      const stop = () => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL")
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
        }
      }
      signal.addEventListener("abort", stop, { once: true })
      child.stdout.on("data", (bytes: Buffer) => chunks.push({ stream: "stdout", bytes }))
      child.stderr.on("data", (bytes: Buffer) => chunks.push({ stream: "stderr", bytes }))
      child.on("error", (error) => {
        failure = error
      })
      child.stdin.on("error", (error) => {
        failure = error
        stop()
      })
      child.on("close", (code) => {
        signal.removeEventListener("abort", stop)
        if (signal.aborted) resolve({ kind: "stopped", detail: String(signal.reason) })
        else if (failure !== undefined) resolve({ kind: "failed", detail: failure.message })
        else
          resolve({
            kind: "exited",
            code,
            stdout: Buffer.concat(
              chunks.filter(({ stream }) => stream === "stdout").map(({ bytes }) => bytes),
            ).toString(),
            stderr: Buffer.concat(
              chunks.filter(({ stream }) => stream === "stderr").map(({ bytes }) => bytes),
            ).toString(),
            output: Buffer.concat(chunks.map(({ bytes }) => bytes)).toString(),
          })
      })
      child.stdin.end(input)
    })
  } catch (error) {
    return { kind: "failed", detail: error instanceof Error ? error.message : String(error) }
  }
}
