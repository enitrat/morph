import {
  type Dispatch,
  type PointerEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { z } from "zod"

import { type ThemeModel, themeOfRoot } from "../core/design-system"
import { followBoxes } from "../inspector/boxes"
import { isPointShortcut, isTyping, startPointing } from "../inspector/pointer"
import { above, below } from "../inspector/target"
import { type Anchor, type Ask, type Choice, type Mark, SessionId } from "../variant/model"
import { bridge, explain } from "./bridge"
import { catalogNow, invalidateCatalog, labelNow } from "./catalog"
import { EDGE, PANEL_MAX_HEIGHT, PANEL_WIDTH } from "./geometry"
import { Icon } from "./icons"
import { type Actions, PageTheme, PanelBody, Pill, statusOf, Trail } from "./panel"
import { THEME_PREVIEW } from "./preview"
import { pickedOf, repicked } from "./repick"
import { Marks, reaimed, SketchLayer } from "./sketch"
import { invalidateSources, locate } from "./source"
import {
  canRefine,
  climbsOnArrow,
  type Draft,
  type Event,
  initial,
  type Picked,
  reduce,
  type Retry,
  sendsOnEnter,
  shownOf,
  type Stage,
  unsettled,
} from "./state"
import { OVERLAY_CSS } from "./styles"
import { type Side, sideFor, type ShownTheme, useCollapsed, usePageTheme, useThemes } from "./view"

const POLL_MS = 1000
const SESSION_KEY = "tune:session"
const CHOICES: Partial<Record<string, Choice>> = { 0: "original", 1: "v1", 2: "v2", 3: "v3" }

const Stored = z.object({
  id: SessionId,
  spots: z.array(z.object({ x: z.number(), y: z.number() })),
})
type Stored = z.infer<typeof Stored>

/**
 * The open session's id, so a full reload of the page finds it again, and the spots of what it is
 * about, so a refine after the reload picks them again.
 */
const stored = {
  read(): Stored | null {
    try {
      const value = Stored.safeParse(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"))
      return value.success ? value.data : null
    } catch {
      return null
    }
  },
  write(value: Stored | null) {
    try {
      if (value === null) sessionStorage.removeItem(SESSION_KEY)
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
    } catch {
      // Without storage a reload forgets the session; `pnpm tune status` still finds it.
    }
  },
}

/** `<html>`'s attributes as the page last set them; a theme Tune previews leaves it unchanged. */
let hostRoot = "[]"
const hostRootNow = () => {
  const root = document.documentElement
  if (root.dataset[THEME_PREVIEW] === undefined)
    hostRoot = JSON.stringify([...root.attributes].map(({ name, value }) => [name, value]))
  return hostRoot
}
const watchHostRoot = (changed: () => void) => {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true })
  return () => {
    observer.disconnect()
  }
}

/**
 * Follows the host page's theme, and whether it is dark, which the overlay's own look follows:
 * next-themes' `dark` class, else the colour scheme it writes.
 */
function useHostTheme(themes: ThemeModel | null): { theme: ShownTheme | null; dark: boolean } {
  const root = useSyncExternalStore(watchHostRoot, hostRootNow, () => "[]")
  return useMemo(() => {
    const { class: names = "", ...attributes } = Object.fromEntries(
      JSON.parse(root) as [string, string][],
    )
    const classes = new Set(names.split(/\s+/).filter(Boolean))
    const dark = classes.has("dark") || /color-scheme:\s*dark/.test(attributes.style ?? "")
    if (themes === null) return { theme: null, dark }
    return { theme: { name: themeOfRoot(themes, { classes, attributes }), themes }, dark }
  }, [root, themes])
}

/** Where the panel sits: docked beside what the designer works on, or where they dropped it. */
const Dock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("docked") }),
  z.object({ kind: z.literal("dropped"), left: z.number(), top: z.number() }),
])
type Dock = z.infer<typeof Dock>

/** The panel's place this render: a docked side and the height it may take, or the drop. */
type Place = { kind: "docked"; side: Side; room: number } | Extract<Dock, { kind: "dropped" }>

const DOCK_KEY = "tune:panel"
/** Enough of the panel to drag it back. */
const HEAD_HEIGHT = 48

/** Next's dev indicator, in whichever corner the app put it. */
const nextBadge = () =>
  document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-toast]") ?? null

/** The docked panel's offset from the bottom: above Next's dev indicator when it sits on that side. */
function dockedBottom(side: Side): number {
  const badge = nextBadge()?.getBoundingClientRect()
  if (side === "bottom" || badge === undefined || badge.width === 0) return EDGE
  const onSide =
    side === "left" ? badge.left < window.innerWidth / 2 : badge.left >= window.innerWidth / 2
  return onSide ? window.innerHeight - badge.top + 8 : EDGE
}

function readDock(): Dock {
  try {
    const dock = Dock.safeParse(JSON.parse(sessionStorage.getItem(DOCK_KEY) ?? "null"))
    if (dock.success) return dock.data
  } catch {
    // Without storage the panel docks again on each load.
  }
  return { kind: "docked" }
}

/** Retains placement across an intentional remount when session storage is unavailable. */
let lastDock: Dock | undefined

const clamp = (value: number, max: number) => Math.min(Math.max(EDGE, value), max)

/** Docks the panel clear of what the designer picked and marked; a dropped panel stays put. */
function usePlace(elements: readonly Element[]): readonly [Place, (next: Dock) => void] {
  const [dock, setDock] = useState(() => (lastDock ??= readDock()))
  const place = (next: Dock) => {
    lastDock = next
    setDock(next)
    try {
      sessionStorage.setItem(DOCK_KEY, JSON.stringify(next))
    } catch {
      // The in-memory placement survives remounts even without storage.
    }
  }
  const docked = useMemo(() => {
    const boxes = elements
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
    const side = sideFor(boxes, window.innerWidth)
    const lowest = Math.max(0, ...boxes.map((box) => box.bottom))
    const room =
      side === "bottom"
        ? Math.max(HEAD_HEIGHT * 4, window.innerHeight - lowest - 2 * EDGE)
        : PANEL_MAX_HEIGHT
    return { side, room }
  }, [elements])
  return [dock.kind === "dropped" ? dock : { kind: "docked", ...docked }, place]
}

/** Drags the panel by its header; a press on a button there stays a press. */
function dragFrom(event: PointerEvent<HTMLElement>, place: (dock: Dock) => void) {
  const panel = event.currentTarget.parentElement
  if (event.button !== 0 || panel === null || (event.target as Element).closest("button")) return
  const start = panel.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  const header = event.currentTarget
  header.setPointerCapture(event.pointerId)
  const at = (move: { clientX: number; clientY: number }) => ({
    left: clamp(start.left + move.clientX - x, window.innerWidth - start.width - EDGE),
    top: clamp(start.top + move.clientY - y, window.innerHeight - start.height - EDGE),
  })
  const move = (next: globalThis.PointerEvent) => {
    const { left, top } = at(next)
    Object.assign(panel.style, {
      left: `${left}px`,
      top: `${top}px`,
      right: "auto",
      bottom: "auto",
    })
  }
  const up = (next: globalThis.PointerEvent) => {
    header.removeEventListener("pointermove", move)
    header.removeEventListener("pointerup", up)
    header.removeEventListener("pointercancel", up)
    place({ kind: "dropped", ...at(next) })
  }
  header.addEventListener("pointermove", move)
  header.addEventListener("pointerup", up)
  header.addEventListener("pointercancel", up)
}

const markElements = (draft: Draft) =>
  draft.marks.flatMap((mark) =>
    mark.kind === "arrow"
      ? [mark.source, mark.target]
      : [mark.kind === "box" ? mark.at : mark.element],
  )

/** What an ask is about: the picks, else the first marked element. */
const subjectsOf = (draft: Draft) =>
  draft.targets.length > 0 ? draft.targets : markElements(draft).slice(0, 1)

/** Every anchor the ask needs, or a message naming the element whose code was not found. */
async function askOf(id: SessionId, draft: Draft): Promise<Ask | string> {
  if (subjectsOf(draft).length === 0)
    return "Tune lost what this session is about. Keep it and pick again."
  const elements = [...new Set([...draft.targets, ...markElements(draft)])]
  const located = await Promise.all(elements.map(locate))
  const missing = located.find((entry) => entry.anchor === null)
  if (missing) {
    const element = elements[located.indexOf(missing)]
    return `Could not find the code behind ${element ? labelNow(element) : "a target"}. Pick its parent with ↑.`
  }
  const at = (element: Element): Anchor => {
    const anchor = located[elements.indexOf(element)]?.anchor
    if (!anchor) throw new Error("tune: an element of the ask was not located")
    return anchor
  }
  const marks = draft.marks.map((mark): Mark => {
    if (mark.kind === "box")
      return { kind: "box", at: at(mark.at), place: mark.place, label: mark.label }
    if (mark.kind === "arrow")
      return { kind: "arrow", from: at(mark.source), to: at(mark.target), place: mark.place }
    return { kind: "note", at: at(mark.element), text: mark.text }
  })
  const targets = subjectsOf(draft)
  const words = draft.words.trim() || "Apply the sketch marks."
  return { id, words, targets: targets.map(at), marks, count: 3 }
}

/** A key pressed on a button or another control acts on that control. */
const onControl = (event: KeyboardEvent) => {
  const [first] = event.composedPath()
  return (
    first instanceof Element &&
    first.closest(
      "button, a[href], select, summary, [role=button], [role=radio], [role=slider]",
    ) !== null
  )
}

/** A key typed into Tune's own words field. */
const inField = (event: KeyboardEvent) => {
  const [first] = event.composedPath()
  return first instanceof HTMLTextAreaElement && first.classList.contains("field")
}

/** Sessions the designer cancelled while they were planned: their late answers are dropped. */
const cancelled = new Set<SessionId>()

/** What the panel and the keys can do, against the stage this render shows. */
function actionsOf(stage: Stage, dispatch: Dispatch<Event>): Actions {
  const open = stage.kind === "session" && stage.pending === null ? stage : null
  const settle = async (answer: ReturnType<typeof bridge.show>) => {
    const done = await answer
    dispatch(
      done.ok
        ? { kind: "settled", view: done.value, notice: null }
        : { kind: "settled", view: null, notice: explain(done.error) },
    )
  }
  const end = async (kind: "keep" | "discard") => {
    if (open === null) return
    dispatch({ kind: "pending", pending: { kind }, at: Date.now() })
    const done = await bridge[kind](open.id)
    if (done.ok || done.error.kind === "not-found") {
      invalidateCatalog()
      invalidateSources()
      dispatch(
        kind === "keep"
          ? { kind: "ended", kept: true, targets: repicked(open.picked) }
          : { kind: "ended", kept: false },
      )
    } else dispatch({ kind: "settled", view: null, notice: explain(done.error) })
  }
  const send = async () => {
    if (stage.kind !== "composing") return
    const id = SessionId.parse(crypto.randomUUID())
    const since = Date.now()
    const picked = subjectsOf(stage.draft).map(pickedOf)
    dispatch({ kind: "sent", id, at: since, picked, from: null })
    const ask = await askOf(id, stage.draft)
    if (typeof ask === "string") {
      dispatch({ kind: "refused", message: ask, retry: null })
      return
    }
    const asked = await bridge.ask(ask)
    if (cancelled.has(id)) return
    if (asked.ok) {
      dispatch({ kind: "joined", id, view: asked.value, at: since, adopted: false, picked })
      return
    }
    if (asked.error.kind !== "busy") {
      dispatch({ kind: "refused", message: explain(asked.error), retry: null })
      return
    }
    const other = asked.error.session
    const view = await bridge.session(other)
    const shown = view.ok ? view.value : null
    dispatch({ kind: "joined", id: other, view: shown, at: Date.now(), adopted: true, picked: [] })
  }
  const flip = (choice: Choice) => {
    if (open === null) return
    const variant = open.view?.variants.find((entry) => entry.id === choice)
    if (choice !== "original" && variant?.state !== "ready") return
    dispatch({ kind: "pending", pending: { kind: "show", choice }, at: Date.now() })
    void settle(bridge.show(open.id, choice))
  }
  /** Sends a refine, the first time or again as it was; the bridge answers a re-post the same. */
  const refined = async (retry: Retry, picked: readonly Picked[]) => {
    const { request, from } = retry
    const { id } = request.ask
    const since = Date.now()
    dispatch({ kind: "sent", id, at: since, picked, from })
    const asked = await bridge.refine(request)
    if (cancelled.has(id)) return
    if (asked.ok) {
      dispatch({ kind: "joined", id, view: asked.value, at: since, adopted: false, picked })
      return
    }
    // A refine that failed after its keep leaves the kept variant as the page.
    const kept = !(await bridge.session(request.from)).ok
    const why = explain(asked.error)
    dispatch({ kind: "refused", message: kept ? `Kept ${from.variant}. ${why}` : why, retry })
  }
  const refine = async () => {
    if (!open?.refining || !canRefine(open)) return
    const { variant, draft } = open.refining
    const chosen = open.view?.variants.find((entry) => entry.id === variant)
    if (chosen?.state !== "ready") return
    // The page shows the variant, so the targets are found in the code the new round starts from.
    const targets = repicked(open.picked)
    const id = SessionId.parse(crypto.randomUUID())
    const ask = await askOf(id, { ...draft, targets })
    if (typeof ask === "string") {
      dispatch({ kind: "settled", view: null, notice: ask })
      return
    }
    const request = { from: open.id, variant, ask }
    await refined({ request, from: { variant, title: chosen.title } }, targets.map(pickedOf))
  }
  return {
    send: () => void send(),
    cancel() {
      if (stage.kind !== "asking") return
      cancelled.add(stage.id)
      dispatch({ kind: "ended", kept: false })
      void bridge.discard(stage.id)
    },
    flip,
    retry(variant) {
      if (open === null) return
      dispatch({ kind: "pending", pending: { kind: "retry", variant }, at: Date.now() })
      void settle(bridge.retry(open.id, variant))
    },
    keep: () => void end("keep"),
    discard: () => void end("discard"),
    refine(variant) {
      if (open === null) return
      if (variant === null) {
        dispatch({ kind: "unrefine" })
        return
      }
      if (shownOf(open.view) !== variant) flip(variant)
      dispatch({ kind: "refine", variant })
    },
    sendRefine: () => void refine(),
    retryRefine() {
      if (stage.kind !== "failed" || stage.retry === null) return
      void refined(stage.retry, stage.draft.targets.map(pickedOf))
    },
    back() {
      if (stage.kind !== "failed") return
      // A refine that never planned leaves its recorded parent behind; dropping it is a no-op otherwise.
      if (stage.retry !== null) void bridge.discard(stage.retry.request.ask.id)
      dispatch({ kind: "back" })
    },
  }
}

/** 0 to 3 flip; R gives feedback on the shown variant; Esc closes the feedback. */
function sessionKey(
  event: KeyboardEvent,
  stage: Extract<Stage, { kind: "session" }>,
  actions: Actions,
) {
  const choice = CHOICES[event.key]
  const shown = shownOf(stage.view)
  if (choice !== undefined) {
    event.preventDefault()
    actions.flip(choice)
  } else if (event.key === "r" && !event.shiftKey && shown !== null && shown !== "original") {
    event.preventDefault()
    actions.refine(shown)
  } else if (event.key === "Escape" && stage.refining !== null) actions.refine(null)
}

/** Polls the open session every second while it still changes on its own or shows a notice. */
function usePolling(stage: Stage, dispatch: Dispatch<Event>) {
  const id = stage.kind === "session" ? stage.id : null
  // A notice also polls, so a session discarded from a terminal ends here on its own.
  const polling =
    stage.kind === "session" &&
    stage.pending === null &&
    (unsettled(stage) || stage.notice !== null)
  useEffect(() => {
    if (id === null || !polling) return undefined
    const stop = new AbortController()
    let asking = false
    const timer = setInterval(async () => {
      if (asking) return
      asking = true
      const answer = await bridge.session(id)
      asking = false
      if (stop.signal.aborted) return
      if (answer.ok) dispatch({ kind: "viewed", id, view: answer.value })
      else if (answer.error.kind === "not-found") dispatch({ kind: "ended", kept: false })
      else if (answer.error.kind === "unbuilt")
        dispatch({ kind: "settled", view: null, notice: explain(answer.error) })
    }, POLL_MS)
    return () => {
      stop.abort()
      clearInterval(timer)
    }
  }, [id, polling, dispatch])
}

function describe(element: Element, tag: HTMLElement) {
  tag.textContent = labelNow(element)
}

/** Outlines the picked targets, following layout and scroll. */
function Targets({ targets }: { targets: readonly Element[] }) {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (layer.current === null || targets.length === 0) return undefined
    return followBoxes(layer.current, targets, "target")
  }, [targets])
  return <div ref={layer} />
}

/** Rejoins the session a full reload left open, and remembers the one that is open. */
function useStoredSession(stage: Stage, dispatch: Dispatch<Event>) {
  useEffect(() => {
    const value = stored.read()
    if (value === null) return
    const { id, spots } = value
    const picked = spots.map((at): Picked => ({ element: null, at }))
    void (async () => {
      const answer = await bridge.session(id)
      if (answer.ok) {
        const at = Date.now()
        dispatch({ kind: "joined", id, view: answer.value, at, adopted: false, picked })
      } else stored.write(null)
    })()
  }, [dispatch])
  const session = stage.kind === "session" ? stage : null
  const id = session?.id ?? null
  const picked = session?.picked
  const had = useRef(false)
  useEffect(() => {
    if (id !== null) stored.write({ id, spots: (picked ?? []).map((entry) => entry.at) })
    else if (had.current) stored.write(null)
    had.current = id !== null
  }, [id, picked])
}

/**
 * ↑ and ↓ on the one pick: ↑ to the next meaningful box, ↓ back down the way ↑ came, else to the
 * box under where the pick was clicked.
 */
function useClimb(draft: Draft, dispatch: Dispatch<Event>) {
  // In document coordinates, so a scroll since the click still finds the same spot.
  const clickedAt = useRef<{ x: number; y: number } | null>(null)
  const climbed = useRef<Element[]>([])
  return {
    clicked(at: { x: number; y: number }) {
      clickedAt.current = { x: at.x + window.scrollX, y: at.y + window.scrollY }
      climbed.current = []
    },
    step(up: boolean) {
      const [target] = draft.targets
      if (target === undefined) return
      let next: Element | null
      if (up) {
        next = above(target, catalogNow())
        if (next !== null) climbed.current.push(target)
      } else {
        const inner = climbed.current.at(-1)
        const at = clickedAt.current
        next =
          inner !== undefined && target.contains(inner)
            ? (climbed.current.pop() ?? null)
            : at && below(target, at.x - window.scrollX, at.y - window.scrollY, catalogNow())
      }
      if (next !== null) dispatch({ kind: "picked", element: next, add: false })
    },
  }
}

/** The panel, docked or dropped; a session folds it to a pill and sets the page's theme. */
function Panel({
  stage,
  dispatch,
  actions,
  theme,
  dock,
  place,
  panel,
}: {
  stage: Stage
  dispatch: Dispatch<Event>
  actions: Actions
  theme: ShownTheme | null
  dock: Place
  place: (next: Dock) => void
  panel: RefObject<HTMLElement | null>
}) {
  const page = usePageTheme(stage, theme?.themes ?? null)
  const [collapsed, setCollapsed] = useCollapsed()
  // Refine unfolds the pill into the feedback field; the panel folds again once it is sent.
  const pill = stage.kind === "session" && collapsed && stage.refining === null
  return (
    <section
      key={dock.kind}
      ref={panel}
      className="panel"
      aria-label="Tune"
      data-x={dock.kind === "docked" ? dock.side : undefined}
      data-pill={pill || undefined}
      style={
        dock.kind === "dropped"
          ? {
              left: clamp(dock.left, window.innerWidth - PANEL_WIDTH - EDGE),
              top: clamp(dock.top, window.innerHeight - HEAD_HEIGHT),
            }
          : {
              bottom: dockedBottom(dock.side),
              maxHeight: Math.min(dock.room, window.innerHeight - 2 * EDGE),
            }
      }
    >
      {stage.kind === "session" && pill ? (
        <Pill
          stage={stage}
          actions={actions}
          onExpand={() => {
            setCollapsed(false)
          }}
        />
      ) : (
        <>
          <header
            className="head"
            title="Drag to move"
            onPointerDown={(event) => {
              dragFrom(event, place)
            }}
          >
            <span className="title">Tune</span>
            <span className="status">{statusOf(stage)}</span>
            {stage.kind === "session" && (
              <>
                {theme !== null && (
                  <PageTheme
                    theme={page.shown ?? theme.name}
                    themes={theme.themes}
                    choose={page.choose}
                  />
                )}
                <button
                  type="button"
                  className="icon"
                  aria-label="Fold Tune"
                  title="Fold"
                  onClick={() => {
                    setCollapsed(true)
                  }}
                >
                  <Icon name="collapse" />
                </button>
              </>
            )}
            <button
              type="button"
              className="icon"
              aria-label="Close Tune"
              onClick={() => {
                dispatch({ kind: "closed" })
              }}
            >
              <Icon name="close" />
            </button>
          </header>
          {stage.kind === "session" && <Trail view={stage.view} />}
          <PanelBody stage={stage} dispatch={dispatch} actions={actions} theme={theme} />
        </>
      )}
    </section>
  )
}

/** The document's development tools, with selection, variant sessions, and fine-tuning. */
export function Overlay() {
  const [state, dispatch] = useReducer(reduce, initial)
  const { open, stage } = state
  const { draft } = stage
  const actions = actionsOf(stage, dispatch)
  const { theme, dark } = useHostTheme(useThemes(open, stage.kind, draft.targets))
  const elements = useMemo(() => [...draft.targets, ...markElements(draft)], [draft])
  const panel = useRef<HTMLElement | null>(null)
  const [dock, place] = usePlace(elements)
  // What the designer draws on: the draft, or the feedback on a shown variant.
  const editing =
    stage.kind === "composing" ? stage : stage.kind === "session" ? stage.refining : null
  const tool = editing !== null && open ? editing.tool : null
  // The marks point at the page as it was; a shown variant moved it, so they leave until it goes.
  const variantShown = stage.kind === "session" && !["original", null].includes(shownOf(stage.view))
  // The arrow just drawn, which Tab aims a block higher until the next click or key.
  const [aimed, setAimed] = useState<number | null>(null)
  const aiming = editing !== null && aimed !== null
  useEffect(() => {
    if (!aiming) return undefined
    const stop = () => {
      setAimed(null)
    }
    window.addEventListener("pointerdown", stop, true)
    return () => {
      window.removeEventListener("pointerdown", stop, true)
    }
  }, [aiming])

  const climb = useClimb(draft, dispatch)

  usePolling(stage, dispatch)
  useStoredSession(stage, dispatch)

  /**
   * Alt+Shift+R opens and closes; ↑↓ climb the one pick; Tab lifts an aimed arrow; Enter makes
   * variants or sends feedback; 0 to 3 flip a session's variants; R gives feedback on the shown
   * one; Esc drops a tool, then the feedback.
   */
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (isPointShortcut(event)) {
      event.preventDefault()
      dispatch({ kind: "toggled" })
      return
    }
    if (!open || event.metaKey || event.ctrlKey || event.altKey) return
    const arrowKey = event.key === "ArrowUp" || event.key === "ArrowDown"
    if (arrowKey && !event.shiftKey && inField(event) && climbsOnArrow(stage)) {
      event.preventDefault()
      climb.step(event.key === "ArrowUp")
      return
    }
    if (isTyping(event)) return
    const arrow = aiming && editing.draft.marks.find((mark) => mark.key === aimed)
    if (arrow && arrow.kind === "arrow" && event.key === "Tab" && !event.shiftKey) {
      event.preventDefault()
      dispatch({ kind: "retargeted", key: arrow.key, ...reaimed(arrow, arrow.level + 1) })
      return
    }
    if (event.key !== "Shift") setAimed(null)
    if (event.key === "Enter" && !event.shiftKey && !onControl(event) && sendsOnEnter(stage)) {
      event.preventDefault()
      if (stage.kind === "composing") actions.send()
      else actions.sendRefine()
      return
    }
    if (event.key === "Escape" && tool !== null) dispatch({ kind: "tool", tool: null })
    else if (stage.kind === "session") sessionKey(event, stage, actions)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onKey(event)
    }
    window.addEventListener("keydown", listener, true)
    return () => {
      window.removeEventListener("keydown", listener, true)
    }
  }, [])

  const onPick = useEffectEvent((element: Element, add: boolean, at: { x: number; y: number }) => {
    climb.clicked(at)
    dispatch({ kind: "picked", element, add })
  })
  useEffect(() => {
    if (tool !== "point") return undefined
    return startPointing({
      describe,
      catalog: catalogNow,
      avoid: () => panel.current?.getBoundingClientRect() ?? null,
      onPick: (element, add, at) => {
        onPick(element, add, at)
      },
      onExit: () => {
        dispatch({ kind: "tool", tool: null })
      },
    })
  }, [tool])

  return (
    <div className="root" data-theme={dark ? "dark" : "light"}>
      <style>{OVERLAY_CSS}</style>
      <button
        type="button"
        className="tab"
        aria-label="Tune (Alt+Shift+R)"
        aria-expanded={open}
        title="Tune · Alt+Shift+R"
        onClick={() => {
          dispatch({ kind: "toggled" })
        }}
      >
        <Icon name="pencil" />
      </button>
      {open && !variantShown && <Targets targets={draft.targets} />}
      {tool !== null && tool !== "point" && (
        <SketchLayer key={tool} tool={tool} dispatch={dispatch} onArrow={setAimed} />
      )}
      {open && !variantShown && (
        <Marks
          marks={draft.marks}
          editable={stage.kind === "composing"}
          aimed={aiming ? aimed : null}
          dispatch={dispatch}
        />
      )}
      {open && stage.kind === "session" && stage.refining !== null && (
        <Marks
          marks={stage.refining.draft.marks}
          editable
          aimed={aiming ? aimed : null}
          dispatch={dispatch}
        />
      )}
      {open && (
        <Panel
          stage={stage}
          dispatch={dispatch}
          actions={actions}
          theme={theme}
          dock={dock}
          place={place}
          panel={panel}
        />
      )}
    </div>
  )
}
