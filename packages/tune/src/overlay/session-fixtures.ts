import {
  type PageView,
  type Place,
  RepoPath,
  SessionId,
  type SessionView,
  type VariantView,
} from "../variant/model"

export const ids = {
  hero: SessionId.parse("00000000-0000-4000-8000-000000000001"),
  button: SessionId.parse("00000000-0000-4000-8000-000000000002"),
  card: SessionId.parse("00000000-0000-4000-8000-000000000003"),
}

export const path = (text: string) => RepoPath.parse(text)

export function ready(id: "v1" | "v2" | "v3", files = ["app/hero.tsx"]): VariantView {
  return {
    id,
    direction: { title: `Direction ${id}`, description: "A way." },
    state: "ready",
    title: `Title ${id}`,
    summary: `Summary of ${id}.`,
    files: files.map(path),
    stat: { add: 12, del: 4 },
  }
}

export function pending(
  id: "v1" | "v2" | "v3",
  phase: "queued" | "slot" | "agent" | "checks" | "retry" | "capture" = "agent",
): VariantView {
  return {
    id,
    direction: { title: `Direction ${id}`, description: "A way." },
    state: "pending",
    phase,
  }
}

export function session(
  id: SessionId,
  place: Place,
  variants: VariantView[] = [ready("v1"), ready("v2"), ready("v3")],
): SessionView {
  return { id, place, variants, trail: [], drift: [] }
}

export const page = (...sessions: SessionView[]): PageView => ({ sessions, stuck: [] })
