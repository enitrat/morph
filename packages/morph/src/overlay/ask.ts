import { type Dispatch } from "react"

import {
  type ActiveSessionView,
  type ThreadId,
  threadOf,
  type Anchor,
  type Ask,
  type Choice,
  type Mark,
  type PageView,
  Observation,
  SessionId,
  type VariantId,
} from "../variant/model"
import { type Answer, bridge, explain } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { type AskTarget, type Event, type Sketch } from "./model"
import { captureTarget, resolveTargets, targetElements } from "./pinned-targets"
import { letterOf, submissionId, type Pin } from "./sessions"
import { invalidateSources, locate } from "./source"
import { nameOf } from "./tree"
import { commandId, type SubmissionCommand } from "./submission"
import { rememberSubmission, forgetSubmission } from "./session-store"

/** What the composer sends: what it is about, the words, and the sketch marks on the page. */
export interface AskDraft {
  target: AskTarget
  words: string
  marks: readonly Sketch[]
}

const markElements = (marks: readonly Sketch[]) =>
  marks.flatMap((mark) =>
    mark.kind === "arrow"
      ? [mark.source, mark.target]
      : [mark.kind === "box" ? mark.at : mark.element],
  )

function subjectsOf(target: AskTarget): Element[] {
  if (target.kind === "element") return [target.element]
  const { frame } = target
  return frame.narrow === null
    ? [...frame.items]
    : frame.items.filter((item) => nameOf(item) === frame.narrow)
}

function titleOf(target: AskTarget, subjects: readonly Element[]): string {
  if (target.kind === "element") return nameOf(target.element)
  return target.frame.narrow === null
    ? `Frame · ${subjects.length}`
    : `${subjects.length} × ${target.frame.narrow}`
}

const baseName = (path: string) => path.split("/").at(-1) ?? path

/** The anchors an ask needs, or a message naming the element whose code was not found. */
async function anchorsOf(
  subjects: readonly Element[],
  marks: readonly Sketch[],
): Promise<{ at: (element: Element) => Anchor } | string> {
  const elements = [...new Set([...subjects, ...markElements(marks)])]
  const located = await Promise.all(elements.map(locate))
  const missing = elements.find((_, index) => located[index]?.anchor == null)
  if (missing !== undefined)
    return `Could not find the code behind ${nameOf(missing)}. Pick its parent with ⇧↵.`
  return {
    at: (element: Element) => {
      const anchor = located[elements.indexOf(element)]?.anchor
      if (anchor == null) throw new Error("morph: an element of the ask was not located")
      return anchor
    },
  }
}

const markOf =
  (at: (element: Element) => Anchor) =>
  (mark: Sketch): Mark => {
    if (mark.kind === "box")
      return { kind: "box", at: at(mark.at), place: mark.place, label: mark.label }
    if (mark.kind === "arrow")
      return { kind: "arrow", from: at(mark.source), to: at(mark.target), place: mark.place }
    return { kind: "note", at: at(mark.element), text: mark.text }
  }

const newId = () => SessionId.parse(crypto.randomUUID())

async function sendSubmission(
  pin: Pick<Pin, "id" | "name" | "words" | "file" | "targets"> & { n: number | null },
  command: SubmissionCommand,
  dispatch: Dispatch<Event>,
): Promise<void> {
  if (!rememberSubmission(pin, command))
    dispatch({
      kind: "notice",
      tone: "warn",
      text: "This browser could not save request recovery. Keep this tab open until the request finishes.",
    })
  dispatch({ kind: "sending", thread: pin.id, command })
  const answer =
    command.op === "ask" ? await bridge.ask(command.request) : await bridge.refine(command.request)
  if (answer.ok) {
    forgetSubmission(commandId(command))
    invalidateCatalog()
    invalidateSources()
    dispatch({ kind: "answered", thread: pin.id, id: commandId(command), page: answer.value })
  } else if (
    answer.error.kind === "offline" ||
    answer.error.kind === "crashed" ||
    answer.error.kind === "unbuilt"
  ) {
    dispatch({ kind: "uncertain", thread: pin.id, command, detail: explain(answer.error) })
  } else {
    forgetSubmission(commandId(command))
    dispatch({
      kind: "refused",
      thread: pin.id,
      id: commandId(command),
      text: explain(answer.error),
    })
  }
}

/** What a thread card and its keys can do to a session. */
export interface SessionActions {
  ask: (draft: AskDraft) => Promise<void>
  /** Revokes unfinished lookups when their overlay unmounts. Sent commands remain recoverable. */
  dispose: () => void
  show: (id: SessionId, choice: Choice) => void
  retryPlan: (id: SessionId) => void
  retry: (id: SessionId, variant: VariantId) => void
  keep: (pin: Pin, view: ActiveSessionView, variant: VariantId) => void
  discard: (id: SessionId) => void
  /** Keeps `variant` and asks again on top of it, on the same pin. */
  refine: (pin: Pin, view: ActiveSessionView, variant: VariantId) => void
  resume: (pin: Pin) => void
  cancel: (pin: Pin) => void
  poll: () => void
}

/** Owns requests from locating through acknowledgement, including cancellation and supersession. */
export function actionsOf(publish: Dispatch<Event>): SessionActions {
  const running = new Map<ThreadId, { id: SessionId; from: SessionId | null }>()
  let observation = Observation.parse(0)
  const release = (thread: ThreadId, id: SessionId) => {
    if (running.get(thread)?.id === id) running.delete(thread)
  }
  const dispatch: Dispatch<Event> = (event) => {
    if (
      (event.kind === "page" || event.kind === "answered") &&
      event.page.observation > observation
    ) {
      observation = event.page.observation
      for (const view of event.page.sessions) {
        const pending = running.get(view.thread)
        if (pending !== undefined && view.id !== pending.from) release(view.thread, pending.id)
      }
    }
    publish(event)
  }
  async function ask(draft: AskDraft): Promise<void> {
    const subjects = subjectsOf(draft.target)
    const id = newId()
    const thread = threadOf(id, null)
    const pin = {
      id,
      n: null,
      name: titleOf(draft.target, subjects),
      words: draft.words.trim() || "Apply the sketch marks.",
      file: null,
      targets: subjects.map(captureTarget),
    }
    running.set(thread, { id, from: null })
    dispatch({ kind: "asked", pin })
    try {
      const anchors = await anchorsOf(subjects, draft.marks)
      if (running.get(thread)?.id !== id) return
      if (typeof anchors === "string") {
        dispatch({ kind: "refused", thread, id, text: anchors })
        return
      }
      const first = subjects[0]
      const file = first === undefined ? null : baseName(anchors.at(first).source.path)
      if (file !== null) dispatch({ kind: "located", thread, id, file })
      const request: Ask = {
        id,
        words: pin.words,
        targets: subjects.map(anchors.at),
        marks: draft.marks.map(markOf(anchors.at)),
        count: 3,
      }
      await sendSubmission({ ...pin, id: thread, file }, { op: "ask", request }, dispatch)
    } finally {
      release(thread, id)
    }
  }

  const settle = async (answer: Promise<Answer<PageView>>, done?: () => void) => {
    const result = await answer
    if (result.ok) {
      done?.()
      dispatch({ kind: "page", page: result.value })
    } else dispatch({ kind: "notice", text: explain(result.error), tone: "warn" })
  }
  const changedCode = () => {
    invalidateCatalog()
    invalidateSources()
  }
  return {
    ask,
    dispose: () => running.clear(),
    show: (id, choice) => void settle(bridge.show(id, choice)),
    retryPlan: (id) => void settle(bridge.retryPlan(id)),
    retry: (id, variant) => void settle(bridge.retry(id, variant)),
    keep: (pin, view, variant) =>
      void settle(bridge.keep(view.id, variant), () => {
        changedCode()
        dispatch({
          kind: "notice",
          text: `Kept ${letterOf(variant)} on ${pin.name}${pin.file ? ` in ${pin.file}` : ""}`,
          tone: "info",
        })
      }),
    discard: (id) => void settle(bridge.discard(id), changedCode),
    resume: (pin) => {
      if (pin.submission?.kind !== "uncertain") return
      const command = pin.submission.command
      const id = commandId(command)
      if (running.get(pin.id)?.id === id) return
      running.set(pin.id, { id, from: command.op === "refine" ? command.request.from : null })
      void sendSubmission(pin, command, dispatch).finally(() => {
        release(pin.id, id)
      })
    },
    cancel: (pin) => {
      if (pin.submission === null) return
      const id = submissionId(pin.submission)
      void (async () => {
        const answer = await bridge.discard(id)
        if (answer.ok) {
          release(pin.id, id)
          forgetSubmission(id)
          dispatch({ kind: "answered", thread: pin.id, id, page: answer.value })
        } else dispatch({ kind: "notice", text: explain(answer.error), tone: "warn" })
      })()
    },
    refine: (pin, view, variant) => {
      const words = pin.refine.trim()
      if (words === "" || pin.submission !== null || running.get(pin.id)?.from === view.id) return
      const id = newId()
      running.set(pin.id, { id, from: view.id })
      dispatch({ kind: "locating", thread: pin.id, id, from: view.id, words })
      void (async () => {
        const resolved = resolveTargets(pin.targets)
        const targets = targetElements(resolved)
        dispatch({ kind: "retargeted", id: pin.id, matches: resolved.map(({ match }) => match) })
        const anchors = await anchorsOf(targets, [])
        if (running.get(pin.id)?.id !== id) return
        if (typeof anchors === "string" || targets.length === 0) {
          dispatch({
            kind: "refused",
            thread: pin.id,
            id,
            text: typeof anchors === "string" ? anchors : `Morph lost ${pin.name} on the page.`,
          })
          return
        }
        await sendSubmission(
          { ...pin, targets: resolved },
          {
            op: "refine",
            request: {
              from: view.id,
              variant,
              ask: { id, words, targets: targets.map(anchors.at), marks: [], count: 3 },
            },
          },
          dispatch,
        )
      })().finally(() => {
        release(pin.id, id)
      })
    },
    poll: () =>
      void (async () => {
        const answer = await bridge.page()
        if (answer.ok) dispatch({ kind: "page", page: answer.value })
      })(),
  }
}
