import type { Transport, WireCall, WireReply } from "@enitrat/morph/widget"
import { z } from "zod"
import type { Result, Stage } from "./stage"
import { symbolicate } from "./symbolicate"
import { type Operation, operations, SessionId } from "./wire"

/** The overlay shows its pending states for this long on every write, as over a real bridge. */
const WRITE_MS = 140

type Reply = { status: 200; body: unknown } | { status: 400 | 409; body: { error: unknown } }
type Handler = (call: WireCall, now: number) => Reply | Promise<Reply>

const ok = (body: unknown): Reply => ({ status: 200, body })

/**
 * The page shell renders the board, and every repo file renders through its live binding, so
 * picking looks past both to the scene code that placed a component.
 */
const PLUMBING = [
  { prefix: "site/src/", except: [] },
  { prefix: "site/stage/", except: [] },
]

type Posted = {
  [K in Operation]: (typeof operations)[K] extends { request: z.ZodType } ? K : never
}[Operation]

/** Parses a write's body at the wire, then answers the page view or the stage's refusal. */
const write =
  <K extends Posted>(
    op: K,
    run: (body: z.output<(typeof operations)[K]["request"]>, now: number) => Result<unknown>,
    stage: Stage,
  ): Handler =>
  async ({ body }, now) => {
    await new Promise((resolve) => setTimeout(resolve, WRITE_MS))
    const parsed = operations[op].request.safeParse(body)
    if (!parsed.success)
      return {
        status: 400,
        body: {
          error: { kind: "bad-request", issues: parsed.error.issues.map((issue) => issue.message) },
        },
      }
    // SAFETY: parsed with this operation's request schema; indexing widens its output to a union.
    const result = run(parsed.data as z.output<(typeof operations)[K]["request"]>, now)
    return result.ok ? ok(stage.page(now)) : { status: 409, body: { error: result.refusal } }
  }

const notHere = (what: string): Reply => ({
  status: 409,
  body: { error: { kind: "invalid", detail: `${what} is not part of this playground yet.` } },
})

/**
 * Answers every call the overlay makes from the stage, as the real bridge would answer it on this
 * repo. Every success is parsed with the overlay's own response schema before it goes back, so a
 * malformed replay throws here instead of reading as `offline` in the overlay.
 */
export function replayTransport(
  stage: Stage,
  now: () => number = () => performance.now(),
): Transport {
  const handlers: Record<Operation, Handler> = {
    locate: async ({ body }) => {
      const parsed = operations.locate.request.safeParse(body)
      return parsed.success
        ? ok({ sources: await symbolicate(parsed.data.frames) })
        : { status: 400, body: { error: { kind: "bad-request", issues: ["frames"] } } }
    },
    tokens: () =>
      ok({
        files: [],
        themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
        components: [...stage.manifest.files.values()]
          .filter((file) => file.kind === "component")
          .map((file) => ({
            slug: file.name,
            title: file.name,
            group: file.scene.title,
            naming: "own",
            href: null,
            importFrom: null,
            exports: [file.name],
            namedExports: [file.name],
            files: [file.path],
            reads: [],
            childReads: [],
            props: { kind: "none" },
          })),
        plumbing: PLUMBING,
      }),
    plumbing: () => ok({ plumbing: PLUMBING }),
    tag: () => ok({ classes: [] }),
    props: () => ok({ controls: [] }),
    uses: () => ok({ uses: 1, examples: 0 }),
    attributes: () => ok({ tag: null }),
    prop: () => notHere("Editing props"),
    dial: () => notHere("Fine-tuning"),
    page: (_, at) => ok(stage.poll(at)),
    ask: write(
      "ask",
      (ask, at) => {
        const path = ask.targets[0]?.source.path ?? ""
        return stage.ask({ id: ask.id, path, words: ask.words }, at)
      },
      stage,
    ),
    refine: write(
      "refine",
      ({ from, variant, ask }, at) =>
        stage.refine(
          {
            from,
            variant,
            ask: { id: ask.id, path: ask.targets[0]?.source.path ?? "", words: ask.words },
          },
          at,
        ),
      stage,
    ),
    show: write("show", ({ id, variant }, at) => stage.show(id, variant, at), stage),
    retryPlan: write("retryPlan", ({ id }) => stage.retry(id), stage),
    retry: write("retry", ({ id }) => stage.retry(id), stage),
    keep: write("keep", ({ id, variant }) => stage.keep(id, variant), stage),
    discard: write("discard", ({ id }) => stage.discard(id), stage),
    suggest: ({ query }) => {
      const session = SessionId.safeParse(query.get("session"))
      if (session.success) return ok({ suggestions: stage.suggestions({ session: session.data }) })
      // The composer starts with the first ask, so a visitor only has to press Enter.
      const suggestions = stage.suggestions({ path: query.get("path") ?? "" })
      return ok({ suggestions, prefill: suggestions[0]?.words })
    },
  }

  return async (call): Promise<WireReply> => {
    const reply = await handlers[call.op](call, now())
    if (reply.status !== 200) return reply
    return { status: reply.status, body: operations[call.op].response.parse(reply.body) }
  }
}
