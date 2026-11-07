import { z } from "zod"

import { TuneConfig, type TuneConfigInput } from "../core/config"
import { DialWrite } from "../dial/model"
import { ComponentName, PropWrite } from "../dial/props"
import { Ask, Choice, Refine, RepoPath, SessionId, SourceLoc, VariantId } from "../variant/model"
import { designSystemOf, dial, tagClasses } from "./dial"
import { type Host, openRepo } from "./git"
import { guard } from "./guard"
import { locate } from "./locate"
import { componentUses, propControls, tagAttributes, writeProp } from "./props"
import { ask, discard, type Done, keep, look, refine, type Refusal, retry, show } from "./session"

const FRAME = /^(https?:\/\/.+):(\d+):(\d+)$/

/** `<chunk url>:<line>:<col>`, served by the dev server that answers this request. */
const frameIn = (origin: string) =>
  z
    .string()
    .regex(FRAME)
    .transform((text) => {
      const [, url = "", line = "", col = ""] = FRAME.exec(text) ?? []
      return { url: new URL(url), line: Number(line), col: Number(col) }
    })
    .refine((frame) => frame.url.origin === origin, "frames must come from this dev server")

const SessionRef = z.object({ id: SessionId })
const ChoiceRef = z.object({ id: SessionId, variant: Choice })
const VariantRef = z.object({ id: SessionId, variant: VariantId })

const STATUS: Record<Refusal["kind"], number> = {
  "not-found": 404,
  busy: 409,
  "not-ready": 409,
  conflict: 409,
  "planner-failed": 502,
  invalid: 422,
}

type Answer = Done<unknown>

interface Op {
  method: "GET" | "POST"
  run(request: Request, repo: Host): Promise<Answer>
}

/** The `path`, `line` and `col` search params of a GET that names a JSX tag. */
function siteOf(request: Request): SourceLoc {
  const params = new URL(request.url).searchParams
  return SourceLoc.parse({
    path: params.get("path"),
    line: Number(params.get("line")),
    col: Number(params.get("col")),
  })
}

const body = async <T>(request: Request, schema: z.ZodType<T>) => schema.parse(await request.json())

const OPS: Record<string, Op> = {
  locate: {
    method: "GET",
    async run(request, repo) {
      const url = new URL(request.url)
      const frames = z
        .array(frameIn(url.origin))
        .min(1)
        .max(64)
        .parse(url.searchParams.getAll("frame"))
      return { ok: true, value: { sources: await locate(repo.root, frames) } }
    },
  },
  tokens: { method: "GET", run: async (_, repo) => ({ ok: true, value: designSystemOf(repo) }) },
  tag: {
    method: "GET",
    run: async (request, repo) => ({
      ok: true,
      value: { classes: await tagClasses(repo, siteOf(request)) },
    }),
  },
  props: {
    method: "GET",
    async run(request, repo) {
      const component = z
        .string()
        .regex(/^[A-Z][\w.$]*$/)
        .parse(new URL(request.url).searchParams.get("component"))
      return { ok: true, value: { controls: await propControls(repo, component) } }
    },
  },
  uses: {
    method: "GET",
    async run(request, repo) {
      const params = new URL(request.url).searchParams
      const component = ComponentName.parse(params.get("component"))
      const path = RepoPath.parse(params.get("path"))
      return { ok: true, value: await componentUses(repo, component, path) }
    },
  },
  attributes: {
    method: "GET",
    run: async (request, repo) => ({
      ok: true,
      value: { tag: await tagAttributes(repo, siteOf(request)) },
    }),
  },
  prop: {
    method: "POST",
    run: async (request, repo) => writeProp(repo, await body(request, PropWrite)),
  },
  dial: {
    method: "POST",
    run: async (request, repo) => dial(repo, await body(request, DialWrite)),
  },
  session: {
    method: "GET",
    run: (request, repo) =>
      look(repo, SessionId.parse(new URL(request.url).searchParams.get("id"))),
  },
  ask: {
    method: "POST",
    run: async (request, repo) => ask(repo, await body(request, Ask), request.signal),
  },
  refine: {
    method: "POST",
    run: async (request, repo) => refine(repo, await body(request, Refine), request.signal),
  },
  show: {
    method: "POST",
    async run(request, repo) {
      const { id, variant } = await body(request, ChoiceRef)
      return show(repo, id, variant)
    },
  },
  retry: {
    method: "POST",
    async run(request, repo) {
      const { id, variant } = await body(request, VariantRef)
      return retry(repo, id, variant)
    },
  },
  keep: {
    method: "POST",
    run: async (request, repo) => keep(repo, (await body(request, SessionRef)).id),
  },
  discard: {
    method: "POST",
    run: async (request, repo) => discard(repo, (await body(request, SessionRef)).id),
  },
}

async function handle(
  opened: () => Promise<Host>,
  request: Request,
  { params }: { params: Promise<{ op: string }> },
): Promise<Response> {
  const admitted = guard(request)
  if ("answer" in admitted) return admitted.answer
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: admitted.cors })

  const op = OPS[(await params).op]
  if (op === undefined) return json({ error: { kind: "not-found" } }, 404)
  if (op.method !== request.method) return json({ error: { kind: "method" } }, 405)
  try {
    const answer = await op.run(request, await opened())
    if (answer.ok) return json(answer.value)
    const { ok: _, ...refusal } = answer
    return json({ error: refusal }, STATUS[refusal.kind])
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      const issues =
        error instanceof z.ZodError ? error.issues.map((issue) => issue.message) : [error.message]
      return json({ error: { kind: "bad-request", issues } }, 400)
    }
    console.error(error)
    const detail = error instanceof Error ? error.message : String(error)
    return json({ error: { kind: "crashed", detail } }, 500)
  }
}

/**
 * The Tune bridge as a Next route at `/api/retouch/[op]`; outside development it answers 404. A
 * config that does not parse throws here, so the host's first request fails on it.
 */
export function retouchRoute(input: TuneConfigInput) {
  const config = TuneConfig.parse(input)
  let host: Promise<Host> | undefined
  const opened = () => (host ??= openRepo(process.cwd()).then((repo) => ({ ...repo, config })))
  const route = (request: Request, context: { params: Promise<{ op: string }> }) =>
    handle(opened, request, context)
  return { GET: route, POST: route, OPTIONS: route }
}
