// oxlint-disable-next-line import/no-nodejs-modules -- the app root must match Git’s canonical checkout path.
import { realpath } from "node:fs/promises"

import { z } from "zod"

import { TuneConfigInputSchema, type TuneConfigInput } from "../core/config"
import { operations, type Operation } from "../protocol"
import { ComponentName } from "../dial/props"
import { RepoPath, SessionId, SourceLoc, type Refusal } from "../variant/model"
import { designSystemOf, tagClasses } from "./dial"
import { configAt, type Host, openRepo } from "./git"
import { guard } from "./guard"
import { componentUses, propControls, tagAttributes } from "./props"
import { ask, discard, type Done, keep, look, refine, retry, show } from "./session"
import { type Bundler, type Frame } from "./symbolicate"
import { writeReleased, type WriteFailure } from "./write"

const FRAME = /^(.+):(\d+):(\d+)$/
const SERVER_FRAME = /^(?:about|rsc):\/\/React\//

/**
 * `<url>:<line>:<col>` of an owner stack: code the dev server answering this request served, or a
 * Server Component frame React replayed in the browser.
 */
const frameIn = (origin: string) =>
  z
    .string()
    .regex(FRAME)
    .transform((text): Frame => {
      const [, url = "", line = "", col = ""] = FRAME.exec(text) ?? []
      return { url, line: Number(line), col: Number(col) }
    })
    .refine(
      ({ url }) => SERVER_FRAME.test(url) || (URL.canParse(url) && new URL(url).origin === origin),
      "frames must come from this dev server",
    )

const STATUS: Record<Refusal["kind"], number> = {
  "not-found": 404,
  busy: 409,
  held: 409,
  "not-shown": 409,
  "not-ready": 409,
  conflict: 409,
  "planner-failed": 502,
  invalid: 422,
}

type Ops = {
  [K in Operation]: {
    method: "GET" | "POST"
    run(
      request: Request,
      repo: Host,
      bundler: Bundler,
    ): Promise<Done<z.output<(typeof operations)[K]["response"]>> | WriteFailure>
  }
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

const OPS = {
  locate: {
    method: "POST",
    async run(request, repo, bundler) {
      const { frames: raw } = await body(request, operations.locate.request)
      const frames = z.array(frameIn(new URL(request.url).origin)).parse(raw)
      return { ok: true, value: { sources: await bundler.symbolicate(repo.root, frames) } }
    },
  },
  tokens: { method: "GET", run: async (_, repo) => ({ ok: true, value: designSystemOf(repo) }) },
  plumbing: {
    method: "GET",
    run: async (_, repo) => ({ ok: true, value: { plumbing: repo.config.plumbing } }),
  },
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
    run: async (request, repo) =>
      writeReleased(repo, { kind: "prop", write: await body(request, operations.prop.request) }),
  },
  dial: {
    method: "POST",
    run: async (request, repo) => writeReleased(repo, await body(request, operations.dial.request)),
  },
  session: {
    method: "GET",
    run: (request, repo) =>
      look(repo, SessionId.parse(new URL(request.url).searchParams.get("id"))),
  },
  ask: {
    method: "POST",
    run: async (request, repo) =>
      ask(repo, await body(request, operations.ask.request), request.signal),
  },
  refine: {
    method: "POST",
    run: async (request, repo) =>
      refine(repo, await body(request, operations.refine.request), request.signal),
  },
  show: {
    method: "POST",
    async run(request, repo) {
      const { id, variant } = await body(request, operations.show.request)
      return show(repo, id, variant)
    },
  },
  retry: {
    method: "POST",
    async run(request, repo) {
      const { id, variant } = await body(request, operations.retry.request)
      return retry(repo, id, variant)
    },
  },
  keep: {
    method: "POST",
    run: async (request, repo) => keep(repo, (await body(request, operations.keep.request)).id),
  },
  discard: {
    method: "POST",
    run: async (request, repo) =>
      discard(repo, (await body(request, operations.discard.request)).id),
  },
} satisfies Ops

/** The Tune bridge: answers one op of a request, after the guard admits it. */
export type Handler = (request: Request, op: string) => Promise<Response>

/**
 * The Tune bridge as one Web-standard handler for an adapter to mount; outside development it
 * answers 404. It serves the git checkout holding `dir`, and maps stack frames through `bundler`.
 * A config that does not parse throws here, so the host fails at startup.
 */
export function tuneHandler(
  input: TuneConfigInput,
  { bundler, dir }: { bundler: Bundler; dir: string },
): Handler {
  const config = TuneConfigInputSchema.parse(input)
  let host: Promise<Host> | undefined
  const opened = () =>
    (host ??= openRepo(dir).then(async (repo) => ({
      ...repo,
      config: configAt(repo, await realpath(dir), config),
    })))
  return async (request, name) => {
    const admitted = guard(request)
    if ("answer" in admitted) return admitted.answer
    const json = (value: unknown, status = 200) =>
      Response.json(value, { status, headers: admitted.cors })

    const op = Object.entries(OPS).find(([key]) => key === name)?.[1]
    if (op === undefined) return json({ error: { kind: "not-found" } }, 404)
    if (op.method !== request.method) return json({ error: { kind: "method" } }, 405)
    const failed = (error: unknown) => {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        const issues =
          error instanceof z.ZodError ? error.issues.map((issue) => issue.message) : [error.message]
        return json({ error: { kind: "bad-request", issues } }, 400)
      }
      console.error(error)
      const detail = error instanceof Error ? error.message : String(error)
      return json({ error: { kind: "crashed", detail } }, 500)
    }
    try {
      const answer = await op.run(request, await opened(), bundler)
      if (answer.ok) return json(answer.value)
      if (answer.kind === "write-failed") return failed(answer.cause)
      const { ok: _, ...refusal } = answer
      return json({ error: refusal }, STATUS[refusal.kind])
    } catch (error) {
      return failed(error)
    }
  }
}
