import { z } from "zod"

import { type SessionId, ThreadId } from "../variant/model"
import { NO_SESSIONS, observed, type Pin, type Sessions } from "./sessions"
import { ReferenceMeasurement } from "./pinned-targets"
import { commandId, SubmissionCommand } from "./submission"

const Presentation = z.object({
  n: z.int().positive().nullable(),
  name: z.string(),
  words: z.string(),
  file: z.string().nullable(),
})
const Position = z.object({ x: z.number(), y: z.number() })
const StoredTarget = z.object({
  at: Position,
  reference: ReferenceMeasurement.nullable().catch(null),
})
const Metadata = z.union([
  Presentation.extend({ targets: z.array(StoredTarget) }),
  Presentation.extend({ at: z.array(Position) }).transform(({ at, ...metadata }) => ({
    ...metadata,
    targets: at.map((at) => ({ at, reference: null })),
  })),
])

function metadataOf(pin: Pick<Pin, "name" | "words" | "file" | "targets"> & { n: number | null }) {
  return {
    n: pin.n,
    name: pin.name,
    words: pin.words,
    file: pin.file,
    targets: pin.targets.map(({ at, reference }) => ({ at, reference })),
  }
}

const Entry = z.object({ thread: ThreadId, metadata: Metadata, command: SubmissionCommand })
const PREFIX = "morph:submission:"

function entries(): z.infer<typeof Entry>[] {
  try {
    return Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PREFIX))
      .flatMap((key) => {
        try {
          const parsed = Entry.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"))
          return parsed.success ? [parsed.data] : []
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

/** Writes each tab-owned request before POST, independently of React rendering and other tabs. */
export function rememberSubmission(
  pin: Pick<Pin, "id" | "name" | "words" | "file" | "targets"> & { n: number | null },
  command: SubmissionCommand,
): boolean {
  try {
    sessionStorage.setItem(
      PREFIX + pin.id,
      JSON.stringify({
        thread: pin.id,
        metadata: metadataOf(pin),
        command,
      }),
    )
    return true
  } catch {
    return false
  }
}

/** Removes only the acknowledged request, preserving a later command on the same thread. */
export function forgetSubmission(id: SessionId): void {
  try {
    for (const entry of entries())
      if (commandId(entry.command) === id) sessionStorage.removeItem(PREFIX + entry.thread)
  } catch {
    /* Storage can be disabled while a request is in flight. */
  }
}

/** Removes journal entries only when an observation proves acceptance or supersession. */
export function observeSubmissions(page: Sessions["page"]): void {
  for (const entry of entries())
    if (observed(page, entry.thread, { kind: "sending", command: entry.command }))
      forgetSubmission(commandId(entry.command))
}

/** Restores browser metadata and exact unresolved requests before the first render or poll. */
export function readSessions(): Sessions {
  const pins: Partial<Record<ThreadId, Pin>> = {}
  let numbered = 0
  const add = (thread: ThreadId, metadata: z.infer<typeof Metadata>) => {
    const n = metadata.n ?? ++numbered
    numbered = Math.max(numbered, n)
    const pin: Pin = {
      id: thread,
      n,
      name: metadata.name,
      words: metadata.words,
      file: metadata.file,
      targets: metadata.targets.map((target) => ({ ...target, match: { kind: "missing" } })),
      refine: "",
      submission: null,
    }
    pins[thread] = pin
    return pin
  }
  try {
    const stored = z
      .record(z.string(), z.unknown())
      .safeParse(JSON.parse(localStorage.getItem("morph:pins") ?? "{}"))
    if (stored.success)
      for (const [key, value] of Object.entries(stored.data)) {
        const thread = ThreadId.safeParse(key)
        const metadata = Metadata.safeParse(value)
        if (thread.success && metadata.success) add(thread.data, metadata.data)
      }
  } catch {
    /* Missing browser storage does not prevent live observation. */
  }
  for (const entry of entries()) {
    const pin = pins[entry.thread] ?? add(entry.thread, entry.metadata)
    pins[entry.thread] = {
      ...pin,
      submission: {
        kind: "uncertain",
        command: entry.command,
        detail: "The previous request has no confirmed response. Retry it to recover its outcome.",
      },
    }
  }
  return { ...NO_SESSIONS, pins, numbered }
}

/** Stores presentation hints; accepted lifecycle and current words still come from the server. */
export function writePins(pins: Sessions["pins"]): void {
  const stored = Object.fromEntries(
    Object.values(pins).flatMap((pin) => (pin === undefined ? [] : [[pin.id, metadataOf(pin)]])),
  )
  try {
    localStorage.setItem("morph:pins", JSON.stringify(stored))
  } catch {
    /* Pins still work without reload hints. */
  }
}
