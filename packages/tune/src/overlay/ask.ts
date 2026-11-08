import { type Dispatch } from "react"

import {
  type Anchor,
  type Ask,
  type Choice,
  type Mark,
  type PageView,
  SessionId,
  type VariantId,
} from "../variant/model"
import { type Answer, bridge, explain } from "./bridge"
import { invalidateCatalog } from "./catalog"
import { type AskTarget, type Event, type Sketch } from "./model"
import { pickedOf, repicked } from "./repick"
import { letterOf, type Pin } from "./sessions"
import { invalidateSources, locate } from "./source"
import { specOf } from "./specs"
import { nameOf } from "./tree"

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
      if (anchor == null) throw new Error("tune: an element of the ask was not located")
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

/**
 * The one door from the composer to variant sessions: pins the target at once, so the designer
 * can go on to the next component, then starts three variants. The pin records what it needs to
 * find the target again after a reload.
 */
export async function ask(draft: AskDraft, dispatch: Dispatch<Event>): Promise<void> {
  const subjects = subjectsOf(draft.target)
  const id = newId()
  const first = subjects[0]
  const located = first === undefined ? null : await locate(first)
  dispatch({
    kind: "asked",
    pin: {
      id,
      n: null,
      name: titleOf(draft.target, subjects),
      words: draft.words.trim() || "Apply the sketch marks.",
      file: located?.anchor ? baseName(located.anchor.source.path) : null,
      picked: subjects.map(pickedOf),
      baseline: draft.target.kind === "element" ? specOf(draft.target.element) : null,
    },
  })
  const anchors = await anchorsOf(subjects, draft.marks)
  if (typeof anchors === "string") {
    dispatch({ kind: "dropped", id, text: anchors })
    return
  }
  const request: Ask = {
    id,
    words: draft.words.trim() || "Apply the sketch marks.",
    targets: subjects.map(anchors.at),
    marks: draft.marks.map(markOf(anchors.at)),
    count: 3,
  }
  const answer = await bridge.ask(request)
  if (answer.ok) dispatch({ kind: "page", page: answer.value })
  else dispatch({ kind: "dropped", id, text: explain(answer.error) })
}

/** What a thread card and its keys can do to a session. */
export interface SessionActions {
  show: (id: SessionId, choice: Choice) => void
  retry: (id: SessionId, variant: VariantId) => void
  keep: (pin: Pin, variant: VariantId) => void
  discard: (id: SessionId) => void
  /** Keeps `variant` and asks again on top of it, on the same pin. */
  refine: (pin: Pin, variant: VariantId) => void
  poll: () => void
}

export function actionsOf(dispatch: Dispatch<Event>): SessionActions {
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
    show: (id, choice) => void settle(bridge.show(id, choice)),
    retry: (id, variant) => void settle(bridge.retry(id, variant)),
    keep: (pin, variant) =>
      void settle(bridge.keep(pin.id, variant), () => {
        changedCode()
        dispatch({
          kind: "notice",
          text: `Kept ${letterOf(variant)} on ${pin.name}${pin.file ? ` in ${pin.file}` : ""}`,
          tone: "info",
        })
      }),
    discard: (id) => void settle(bridge.discard(id), changedCode),
    refine: (pin, variant) =>
      void (async () => {
        const words = pin.refine.trim()
        if (words === "") return
        const targets = repicked(pin.picked)
        const anchors = await anchorsOf(targets, [])
        if (typeof anchors === "string" || targets.length === 0) {
          dispatch({
            kind: "notice",
            text: typeof anchors === "string" ? anchors : `Tune lost ${pin.name} on the page.`,
            tone: "warn",
          })
          return
        }
        const id = newId()
        dispatch({ kind: "refined", from: pin.id, id, words })
        dispatch({ kind: "retargeted", id, picked: targets.map(pickedOf) })
        const answer = await bridge.refine({
          from: pin.id,
          variant,
          ask: { id, words, targets: targets.map(anchors.at), marks: [], count: 3 },
        })
        if (answer.ok) {
          changedCode()
          dispatch({ kind: "page", page: answer.value })
          return
        }
        dispatch({ kind: "refined", from: id, id: pin.id, words: pin.words })
        dispatch({ kind: "notice", text: explain(answer.error), tone: "warn" })
      })(),
    poll: () =>
      void (async () => {
        const answer = await bridge.page()
        if (answer.ok) dispatch({ kind: "page", page: answer.value })
      })(),
  }
}
