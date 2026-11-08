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

let base: string | undefined

/** Points the bridge at the path its adapter mounts it on, before the overlay renders. */
export function connect(to: string) {
  base = to.replace(/\/+$/, "")
}

async function call<K extends Operation>(
  op: K,
  query = "",
  init: RequestInit = {},
): Promise<Answer<z.output<(typeof operations)[K]["response"]>>> {
  // The indexed schema and output share K; TypeScript widens the indexed access to a union.
  const schema = operations[op].response as z.ZodType<z.output<(typeof operations)[K]["response"]>>
  if (base === undefined) throw new Error("tune: the overlay called the bridge before connect()")
  try {
    const response = await fetch(`${base}/${op}${query}`, {
      ...init,
      headers: { "x-tune": "1", "content-type": "application/json" },
    })
    const body: unknown = await response.json().catch(() => null)
    if (response.ok) {
      const parsed = schema.safeParse(body)
      if (parsed.success) return { ok: true, value: parsed.data }
      return {
        ok: false,
        error: { kind: "offline", detail: "the bridge sent an invalid response" },
      }
    }
    const refusal = z.object({ error: WireError }).safeParse(body)
    if (refusal.success) return { ok: false, error: refusal.data.error }
    // Next's dev server answers every route with its build error page while any module fails to
    // build, so the bridge cannot run until the tree builds again.
    if (response.status === 500) return { ok: false, error: { kind: "unbuilt" } }
    return {
      ok: false,
      error: { kind: "offline", detail: `the bridge answered ${response.status}` },
    }
  } catch (error) {
    return { ok: false, error: { kind: "offline", detail: String(error) } }
  }
}

type PostOperation = {
  [K in Operation]: (typeof operations)[K] extends { request: z.ZodType } ? K : never
}[Operation]
const post = <K extends PostOperation>(op: K, body: z.input<(typeof operations)[K]["request"]>) =>
  call(op, "", { method: "POST", body: JSON.stringify(body) })

const siteQuery = (site: SourceLoc) =>
  new URLSearchParams({
    path: site.path,
    line: String(site.line),
    col: String(site.col),
  }).toString()

export const bridge = {
  locate: (frames: readonly string[]) => post("locate", { frames: [...frames] }),
  ask: (ask: Ask) => post("ask", ask),
  refine: (refine: Refine) => post("refine", refine),
  session: (id: SessionId) => call("session", `?id=${id}`),
  show: (id: SessionId, variant: Choice) => post("show", { id, variant }),
  retry: (id: SessionId, variant: VariantId) => post("retry", { id, variant }),
  keep: (id: SessionId) => post("keep", { id }),
  discard: (id: SessionId) => post("discard", { id }),
  tokens: () => call("tokens"),
  plumbing: () => call("plumbing"),
  tag: (site: SourceLoc) => call("tag", `?${siteQuery(site)}`),
  dial: (write: DialWrite) => post("dial", write),
  props: (component: string) => call("props", `?${new URLSearchParams({ component })}`),
  attributes: (site: SourceLoc) => call("attributes", `?${siteQuery(site)}`),
  uses: (component: string, path: RepoPath) =>
    call("uses", `?${new URLSearchParams({ component, path })}`),
  prop: (write: PropWrite) => post("prop", write),
}

export function explain(error: BridgeError): string {
  if (error.kind === "busy") return "A Tune session is open. Keep or discard it first."
  if (error.kind === "invalid") return error.detail
  if (error.kind === "not-found") return "That session is gone. Start again."
  if (error.kind === "not-ready") return `${error.variant} is not ready yet.`
  if (error.kind === "conflict")
    return `Your own edits overlap this variant in ${error.files.join(", ")}. Save or undo them, then try again.`
  if (error.kind === "planner-failed")
    return `Could not plan variants: ${error.detail.split("\n")[0] ?? ""}`
  if (error.kind === "bad-request")
    return `The bridge refused the request: ${error.issues.join("; ")}`
  if (error.kind === "crashed")
    return `Tune hit a bug; the edit may have been applied: ${error.detail}`
  if (error.kind === "method") return "The bridge rejected the request method."
  if (error.kind === "unbuilt")
    return "The page doesn't build with this variant. Run pnpm tune discard in a terminal."
  return `The dev server did not answer (${error.detail}).`
}
