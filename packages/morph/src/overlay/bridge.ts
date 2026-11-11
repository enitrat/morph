import { z } from "zod"
import { operations, type Operation, WireError } from "../protocol"
import { type DialWrite } from "../dial/model"
import { type PropWrite } from "../dial/props"
import {
  type Ask,
  type Choice,
  type Refine,
  type RepoPath,
  type SessionId,
  type SourceLoc,
  type VariantId,
} from "../variant/model"

type BridgeError = WireError | { kind: "offline"; detail: string } | { kind: "unbuilt" }
export type Answer<T> = { ok: true; value: T } | { ok: false; error: BridgeError }

/** One request to the bridge. `body` is undefined for a GET. */
export interface WireCall {
  op: Operation
  query: URLSearchParams
  body: unknown
}
/** The bridge's answer: an HTTP-like status and the parsed JSON body, or `null` when there is none. */
export interface WireReply {
  status: number
  body: unknown
}
/**
 * Carries calls to a bridge and back. It moves bytes only: the overlay validates every reply
 * against the protocol, so a transport needs no domain knowledge. A throw reads as offline.
 */
export type Transport = (call: WireCall) => Promise<WireReply>

/** The dev-server bridge mounted at `base`, such as `/api/morph`. */
export function httpTransport(base: string): Transport {
  const root = base.replace(/\/+$/, "")
  return async ({ op, query, body }) => {
    const search = query.size === 0 ? "" : `?${query}`
    const response = await fetch(`${root}/${op}${search}`, {
      headers: { "x-morph": "1", "content-type": "application/json" },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
}

let transport: Transport | undefined

/** Points the overlay at its bridge before it renders: a base path, or a transport. */
export function connect(to: string | Transport) {
  transport = typeof to === "string" ? httpTransport(to) : to
}

async function call<K extends Operation>(
  op: K,
  query = new URLSearchParams(),
  body?: unknown,
): Promise<Answer<z.output<(typeof operations)[K]["response"]>>> {
  const schema = operations[op].response
  if (transport === undefined)
    throw new Error("morph: the overlay called the bridge before connect()")
  try {
    const { status, body: reply } = await transport({ op, query, body })
    const ok = status >= 200 && status < 300
    if (ok) {
      const parsed = schema.safeParse(reply)
      if (parsed.success)
        // SAFETY: Parsing used this operation's response schema; indexing widens its output to a union.
        return { ok: true, value: parsed.data as z.output<(typeof operations)[K]["response"]> }
      return {
        ok: false,
        error: { kind: "offline", detail: "the bridge sent an invalid response" },
      }
    }
    const refusal = z.object({ error: WireError }).safeParse(reply)
    if (refusal.success) return { ok: false, error: refusal.data.error }
    // Next's dev server answers every route with its build error page while any module fails to
    // build, so the bridge cannot run until the tree builds again.
    if (status === 500) return { ok: false, error: { kind: "unbuilt" } }
    return {
      ok: false,
      error: { kind: "offline", detail: `the bridge answered ${status}` },
    }
  } catch (error) {
    return { ok: false, error: { kind: "offline", detail: String(error) } }
  }
}

type PostOperation = {
  [K in Operation]: (typeof operations)[K] extends { request: z.ZodType } ? K : never
}[Operation]
const post = <K extends PostOperation>(op: K, body: z.input<(typeof operations)[K]["request"]>) =>
  call(op, undefined, body)

const siteQuery = (site: SourceLoc) =>
  new URLSearchParams({ path: site.path, line: String(site.line), col: String(site.col) })

export const bridge = {
  locate: (frames: readonly string[]) => post("locate", { frames: [...frames] }),
  ask: (ask: Ask) => post("ask", ask),
  refine: (refine: Refine) => post("refine", refine),
  page: () => call("page"),
  suggest: (about: SourceLoc | SessionId) =>
    call(
      "suggest",
      typeof about === "string" ? new URLSearchParams({ session: about }) : siteQuery(about),
    ),
  show: (id: SessionId, variant: Choice) => post("show", { id, variant }),
  retryPlan: (id: SessionId) => post("retryPlan", { id }),
  retry: (id: SessionId, variant: VariantId) => post("retry", { id, variant }),
  keep: (id: SessionId, variant: VariantId) => post("keep", { id, variant }),
  discard: (id: SessionId) => post("discard", { id }),
  tokens: () => call("tokens"),
  plumbing: () => call("plumbing"),
  tag: (site: SourceLoc) => call("tag", siteQuery(site)),
  dial: (write: DialWrite) => post("dial", write),
  props: (component: string) => call("props", new URLSearchParams({ component })),
  attributes: (site: SourceLoc) => call("attributes", siteQuery(site)),
  uses: (component: string, path: RepoPath) =>
    call("uses", new URLSearchParams({ component, path })),
  prop: (write: PropWrite) => post("prop", write),
}

export function explain(error: BridgeError): string {
  if (error.kind === "held")
    return `Another Ask shows ${[...new Set(error.on.flatMap((hold) => hold.files))].join(", ")}. Discard or keep it first.`
  if (error.kind === "not-shown") return `${error.variant} is not on the page.`
  if (error.kind === "invalid") return error.detail
  if (error.kind === "not-found") return "That session is gone. Start again."
  if (error.kind === "not-ready") return `${error.variant} is not ready yet.`
  if (error.kind === "conflict")
    return `Your own edits overlap this variant in ${error.files.join(", ")}. Save or undo them, then try again.`
  if (error.kind === "bad-request")
    return `The bridge refused the request: ${error.issues.join("; ")}`
  if (error.kind === "crashed")
    return `Morph hit a bug; the edit may have been applied: ${error.detail}`
  if (error.kind === "method") return "The bridge rejected the request method."
  if (error.kind === "unbuilt")
    return "The page doesn't build with this variant. Run pnpm morph discard in a terminal."
  return `The dev server did not answer (${error.detail}).`
}
