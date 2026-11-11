// oxlint-disable-next-line import/no-nodejs-modules -- the bridge runs the claude CLI.
import { tmpdir } from "node:os"

import { z } from "zod"

import { runCommand } from "./command"

export const agentModel = () => process.env.MORPH_MODEL ?? "sonnet"

export const plannerModel = () => process.env.MORPH_PLANNER_MODEL ?? "sonnet"

/** No Bash: the bridge runs every check itself. */
export const EDIT_TOOLS = ["Read", "Edit", "Write", "Grep", "Glob"] as const

/**
 * `--setting-sources ""` loads no settings and no CLAUDE.md, so the run sees only the rules the
 * prompt carries; no hooks, MCP servers, skills or saved session either.
 */
const AGENT_FLAGS = [
  "--setting-sources",
  "",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--no-session-persistence",
]

interface AgentRun {
  /** The working directory; `acceptEdits` approves edits inside it and nowhere else. */
  cwd?: string
  model: string
  tools?: readonly (typeof EDIT_TOOLS)[number][]
  deadlineMs: number
}

/** `writes`: every path the agent asked an edit tool to write, as it named it. */
export type AgentResult<T> =
  | { ok: true; value: T; writes: readonly string[] }
  | { ok: false; detail: string }

const failed = (detail: string): AgentResult<never> => ({ ok: false, detail })

const WRITERS = new Set<string>(["Edit", "Write"])

/**
 * One line of `--output-format stream-json`. Every kind but `assistant` and `result` is skipped,
 * and a malformed `assistant` line breaks the transcript rather than hide a write.
 */
const Event = z.union([
  z.object({
    type: z.literal("assistant"),
    message: z.object({
      content: z.array(
        z.looseObject({
          type: z.string(),
          name: z.string().optional(),
          input: z.unknown().optional(),
        }),
      ),
    }),
  }),
  z.object({
    type: z.literal("result"),
    is_error: z.boolean().optional(),
    result: z.string().optional(),
    structured_output: z.unknown(),
  }),
  z
    .looseObject({ type: z.string().refine((type) => type !== "assistant" && type !== "result") })
    .transform(() => ({ type: "other" as const })),
])
type Event = z.infer<typeof Event>
type Final = Extract<Event, { type: "result" }>

const FilePath = z.object({ file_path: z.string() })

const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The paths a turn's edit tools named, or `null` when one names none: then where it wrote is unknown. */
function writesOf(turn: Extract<Event, { type: "assistant" }>): string[] | null {
  const paths: string[] = []
  for (const part of turn.message.content) {
    if (part.type !== "tool_use" || !WRITERS.has(part.name ?? "")) continue
    const input = FilePath.safeParse(part.input)
    if (!input.success) return null
    paths.push(input.data.file_path)
  }
  return paths
}

function transcriptOf(stdout: string): { writes: string[]; final?: Final } | { broken: string } {
  const writes: string[] = []
  let final: Final | undefined
  for (const text of stdout.split("\n").filter((line) => line.trim() !== "")) {
    const event = Event.safeParse(jsonOf(text))
    if (!event.success) return { broken: text }
    if (event.data.type === "result") final = event.data
    if (event.data.type === "assistant") {
      const named = writesOf(event.data)
      if (named === null) return { broken: text }
      writes.push(...named)
    }
  }
  return { writes, final }
}

function outputOf<T>(
  output: z.ZodType<T>,
  code: number | null,
  stdout: string,
  stderr: string,
): AgentResult<T> {
  if (code !== 0) return failed(`claude exited ${code}: ${(stderr || stdout).slice(-400)}`)
  const transcript = transcriptOf(stdout)
  if ("broken" in transcript)
    return failed(`claude printed an unreadable line: ${transcript.broken.slice(0, 400)}`)
  const { writes, final } = transcript
  if (final === undefined) return failed(`claude printed no result: ${stdout.slice(-400)}`)
  if (final.is_error) return failed(`claude failed: ${final.result ?? "no detail"}`)
  const parsed = output.safeParse(final.structured_output)
  if (!parsed.success) return failed(`claude answered off-schema: ${parsed.error.message}`)
  return { ok: true, value: parsed.data, writes }
}

/** Runs Claude with structured output and an owned, cancellable process group. */
export async function runClaude<T>(
  prompt: string,
  output: z.ZodType<T>,
  signal: AbortSignal,
  { cwd = tmpdir(), model, tools = [], deadlineMs }: AgentRun,
): Promise<AgentResult<T>> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)])
  const schema = JSON.stringify(z.toJSONSchema(output, { io: "input", target: "draft-7" }))
  const access =
    tools.length === 0
      ? ["--tools", ""]
      : ["--tools", tools.join(","), "--permission-mode", "acceptEdits"]
  const format = ["--output-format", "stream-json", "--verbose", "--json-schema", schema]
  const args = ["-p", ...format, "--model", model, ...access, ...AGENT_FLAGS]
  const result = await runCommand("claude", args, { cwd, signal: bounded, input: prompt })
  switch (result.kind) {
    case "stopped":
      return failed(`stopped: ${result.detail}`)
    case "failed":
      return failed(`claude command failed: ${result.detail}`)
    case "exited":
      return outputOf(output, result.code, result.stdout, result.stderr)
  }
}
