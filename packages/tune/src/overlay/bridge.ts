import { type DesignSystemWire } from "../core"
import { type Attribute } from "../dial/jsx"
import { type Dialed, type DialWrite } from "../dial/model"
import {
  type ComponentUses,
  type PropControl,
  type PropWrite,
  type PropWritten,
} from "../dial/props"
import {
  type Ask,
  type Choice,
  type Refine,
  type RepoPath,
  type SessionId,
  type SessionView,
  type SourceLoc,
  type VariantId,
} from "../variant/model"

/** A refusal the bridge answered, or `offline` when it answered nothing usable. */
type BridgeError =
  | { kind: "busy"; session: SessionId }
  | { kind: "not-found" }
  | { kind: "not-ready"; variant: VariantId }
  | { kind: "conflict"; files: readonly RepoPath[] }
  | { kind: "planner-failed"; detail: string }
  | { kind: "invalid"; detail: string }
  | { kind: "bad-request"; issues: readonly string[] }
  | { kind: "offline"; detail: string }
  | { kind: "unbuilt" }
  | { kind: "crashed"; detail: string }

export type Answer<T> = { ok: true; value: T } | { ok: false; error: BridgeError }

const isRefusal = (body: unknown): body is { error: BridgeError } =>
  typeof body === "object" && body !== null && "error" in body

async function call<T>(op: string, init: RequestInit = {}): Promise<Answer<T>> {
  try {
    const response = await fetch(`/api/tune/${op}`, {
      ...init,
      headers: { "x-tune": "1", "content-type": "application/json" },
    })
    const body: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, value: body as T }
    if (isRefusal(body)) return { ok: false, error: body.error }
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

const post = <T>(op: string, body: unknown) =>
  call<T>(op, { method: "POST", body: JSON.stringify(body) })

const siteQuery = (site: SourceLoc) =>
  new URLSearchParams({
    path: site.path,
    line: String(site.line),
    col: String(site.col),
  }).toString()

export const bridge = {
  locate: (frames: readonly string[]) =>
    call<{ sources: (SourceLoc | null)[] }>(
      `locate?${frames.map((frame) => `frame=${encodeURIComponent(frame)}`).join("&")}`,
    ),
  ask: (ask: Ask) => post<SessionView>("ask", ask),
  refine: (refine: Refine) => post<SessionView>("refine", refine),
  session: (id: SessionId) => call<SessionView>(`session?id=${id}`),
  show: (id: SessionId, variant: Choice) => post<SessionView>("show", { id, variant }),
  retry: (id: SessionId, variant: VariantId) => post<SessionView>("retry", { id, variant }),
  keep: (id: SessionId) => post<null>("keep", { id }),
  discard: (id: SessionId) => post<null>("discard", { id }),
  tokens: () => call<DesignSystemWire>("tokens"),
  tag: (site: SourceLoc) => call<{ classes: string[] }>(`tag?${siteQuery(site)}`),
  dial: (write: DialWrite) => post<Dialed>("dial", write),
  props: (component: string) =>
    call<{ controls: PropControl[] }>(`props?${new URLSearchParams({ component }).toString()}`),
  attributes: (site: SourceLoc) =>
    call<{ tag: { name: string; attributes: Attribute[] } | null }>(
      `attributes?${siteQuery(site)}`,
    ),
  uses: (component: string, path: RepoPath) =>
    call<ComponentUses>(`uses?${new URLSearchParams({ component, path }).toString()}`),
  prop: (write: PropWrite) => post<PropWritten>("prop", write),
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
  if (error.kind === "crashed") return `Tune hit a bug and wrote nothing: ${error.detail}`
  if (error.kind === "unbuilt")
    return "The page doesn't build with this variant. Run pnpm tune discard in a terminal."
  return `The dev server did not answer (${error.detail}).`
}
