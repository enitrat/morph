import {
  Observation,
  type PageView,
  type Place,
  RepoPath,
  SessionId,
  threadOf,
  type ThreadId,
  type SessionView,
  type ActiveSessionView,
  type VariantView,
} from "../variant/model"

export const ids = {
  hero: SessionId.parse("00000000-0000-4000-8000-000000000001"),
  button: SessionId.parse("00000000-0000-4000-8000-000000000002"),
  card: SessionId.parse("00000000-0000-4000-8000-000000000003"),
}

export const threads = {
  hero: threadOf(ids.hero, null),
  button: threadOf(ids.button, null),
  card: threadOf(ids.card, null),
}

export const info = (id: SessionId, thread: ThreadId = threadOf(id, null)) => {
  const name = id === ids.hero ? "Hero" : id === ids.button ? "Button" : "Card"
  return {
    id,
    thread,
    words: `Make ${name} calmer`,
    targets: [
      {
        source: { path: RepoPath.parse(`app/${name.toLowerCase()}.tsx`), line: 1, col: 1 },
        owner: [name],
        text: "",
      },
    ],
    trail: [],
  }
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
): ActiveSessionView {
  return { ...info(id), kind: "active", place, variants, drift: [] }
}

let observed = 0

export const page = (...sessions: SessionView[]): PageView => ({
  observation: Observation.parse(++observed),
  sessions,
  stuck: [],
})
