import { type Dispatch, useEffect, useRef, useState } from "react"

import { type ThemeModel } from "../core/design-system"
import { type ThemeName } from "../core/config"
import { boxCaption } from "../inspector/label"
import {
  type Choice,
  type Phase,
  type SessionView,
  type VariantId,
  type VariantView,
} from "../variant/model"
import { labelNow } from "./catalog"
import { FineTune } from "./fine-tune"
import { InspectionSummary } from "./inspection"
import { Icon, type IconName } from "./icons"
import { keyOf, locate, type Located } from "./source"
import {
  canRefine,
  canSend,
  climbsOnArrow,
  type Draft,
  type Event,
  type Refining,
  type Sketch,
  type Stage,
  shownOf,
  type Tool,
} from "./state"
import { type ShownTheme } from "./view"

export interface Actions {
  send: () => void
  /** Stops planning and returns to composing with the draft as it was. */
  cancel: () => void
  flip: (choice: Choice) => void
  retry: (variant: VariantView["id"]) => void
  keep: () => void
  discard: () => void
  /** Opens feedback on a ready variant, showing it; `null` closes it. */
  refine: (variant: VariantId | null) => void
  /** Keeps the variant and starts the next round with the feedback. */
  sendRefine: () => void
  /** Sends a failed refine again. */
  retryRefine: () => void
  /** Leaves a failure for the draft it came from. */
  back: () => void
}

const PHASES: Record<Phase | "queued", string> = {
  queued: "Waiting",
  slot: "Preparing",
  agent: "Drafting",
  checks: "Double-checking",
  retry: "Double-checking",
  capture: "Saving",
}

/** Minutes and seconds since `since`; it re-renders only itself. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="num">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  )
}

/** `Drafting · 0:31` under a slot that is still being made. */
function Progress({ phase, since }: { phase: string; since: number }) {
  return (
    <span className="slot-sub">
      <span className="spinner" />
      {phase} · <Elapsed since={since} />
    </span>
  )
}

function useLocated(element: Element): Located | null {
  const [located, setLocated] = useState<Located | null>(null)
  useEffect(() => {
    const stop = new AbortController()
    void (async () => {
      const found = await locate(element)
      if (!stop.signal.aborted) setLocated(found)
    })()
    return () => {
      stop.abort()
    }
  }, [element])
  return located
}

function Chip({ element, onRemove }: { element: Element; onRemove?: () => void }) {
  const located = useLocated(element)
  const missing = located?.anchor === null
  const source = located?.anchor?.source
  return (
    <span
      className="chip"
      title={source && `${source.path}:${source.line}`}
    >
      <span className="chip-name">{labelNow(element)}</span>
      {missing && <span className="chip-where">Code not found</span>}
      {onRemove && (
        <button
          type="button"
          className="icon"
          aria-label="Remove target"
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      )}
    </span>
  )
}

const TOOLS: readonly { tool: Tool; label: string; icon: IconName; hint: string }[] = [
  { tool: "point", label: "Point", icon: "point", hint: "Pick what to change" },
  { tool: "inspect", label: "Inspect", icon: "inspect", hint: "Drag to reveal measurements · Click to pin · Esc exits" },
  { tool: "box", label: "Box", icon: "box", hint: "Drag where something goes" },
  {
    tool: "arrow",
    label: "Arrow",
    icon: "arrow",
    hint: "Drag from a block to where it moves · Tab aims higher",
  },
  { tool: "note", label: "Note", icon: "note", hint: "Click to pin a note" },
]

function markLine(mark: Sketch): string {
  if (mark.kind === "arrow") return mark.snapped
  if (mark.kind === "box") return boxCaption(mark.label, mark.place, mark.snapped)
  return `Note on ${mark.snapped}${mark.text === "" ? "" : `: ${mark.text}`}`
}

/** The sketch tools, with `point` only where picking is open. */
function Tools({
  tools,
  tool,
  dispatch,
}: {
  tools: readonly Tool[]
  tool: Tool | null
  dispatch: Dispatch<Event>
}) {
  return (
    <div
      className="tools"
      role="toolbar"
      aria-label="Tools"
    >
      {TOOLS.filter((entry) => tools.includes(entry.tool)).map((entry) => (
        <button
          key={entry.tool}
          type="button"
          className="tool"
          aria-pressed={tool === entry.tool}
          title={entry.hint}
          onClick={() => {
            dispatch({ kind: "tool", tool: tool === entry.tool ? null : entry.tool })
          }}
        >
          <Icon name={entry.icon} />
          {entry.label}
        </button>
      ))}
    </div>
  )
}

function MarkList({ marks, dispatch }: { marks: readonly Sketch[]; dispatch: Dispatch<Event> }) {
  if (marks.length === 0) return null
  return (
    <div className="marks">
      {marks.map((mark) => (
        <div
          key={mark.key}
          className="mark-row"
        >
          <span>{markLine(mark)}</span>
          <button
            type="button"
            className="icon"
            aria-label="Remove mark"
            onClick={() => {
              dispatch({ kind: "unmarked", key: mark.key })
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  )
}

const ALL_TOOLS: readonly Tool[] = ["point", "inspect", "box", "arrow", "note"]
const SKETCH_TOOLS: readonly Tool[] = ["box", "arrow", "note"]

function Composing({
  stage,
  dispatch,
  actions,
  theme,
}: {
  stage: Extract<Stage, { kind: "composing" }>
  dispatch: Dispatch<Event>
  actions: Actions
  theme: ShownTheme | null
}) {
  const { draft, tool } = stage
  const field = useRef<HTMLTextAreaElement>(null)
  // Opening the panel or picking a target leads to the words; a fresh mark keeps its own label.
  const last = useRef<Tool | null | "closed">("closed")
  useEffect(() => {
    if (tool === null && (last.current === "point" || last.current === "closed"))
      field.current?.focus()
    last.current = tool
  }, [tool])
  const climbs = climbsOnArrow(stage)
  const hint =
    tool === "point"
      ? "Click picks · Shift-click adds · ↑↓ bigger, smaller · ⌥ exact"
      : (TOOLS.find((entry) => entry.tool === tool)?.hint ??
        (climbs && !canSend(draft)
          ? "↑↓ picks bigger, smaller"
          : climbs
            ? "↑↓ bigger, smaller · Enter makes 3 variants"
            : "Enter makes 3 variants"))
  return (
    <>
      <div className="body">
        {draft.targets.length === 0 ? (
          <p className="hint">Point at what should change, or sketch on the page.</p>
        ) : (
          <div className="chips">
            {draft.targets.map((element) => (
              <Chip
                key={keyOf(element)}
                element={element}
                onRemove={() => {
                  dispatch({ kind: "unpicked", element })
                }}
              />
            ))}
          </div>
        )}
        <Tools
          tools={ALL_TOOLS}
          tool={tool}
          dispatch={dispatch}
        />
        <MarkList
          marks={draft.marks}
          dispatch={dispatch}
        />
        <textarea
          className="field"
          placeholder="What should change?"
          aria-label="What should change?"
          value={draft.words}
          rows={3}
          ref={field}
          onChange={(event) => {
            dispatch({ kind: "typed", words: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (canSend(draft)) actions.send()
          }}
        />
        {tool === "inspect" && draft.targets.length === 1 && draft.targets[0] && (
          <InspectionSummary target={draft.targets[0]} />
        )}
        {draft.targets.length === 1 && draft.targets[0] && theme !== null && (
          <FineTune
            key={`${keyOf(draft.targets)} ${theme.name}`}
            target={draft.targets[0]}
            theme={theme}
          />
        )}
        {draft.targets.length > 1 && <p className="hint">Pick one element to fine-tune it.</p>}
      </div>
      <div className="foot">
        <span className="hint">{hint}</span>
        <button
          type="button"
          className="button primary"
          disabled={!canSend(draft)}
          onClick={actions.send}
        >
          Make variants <kbd>↵</kbd>
        </button>
      </div>
    </>
  )
}

function Stat({ variant }: { variant: Extract<VariantView, { state: "ready" }> }) {
  return (
    <span className="stat mono num">
      <span className="add">+{variant.stat.add}</span>{" "}
      <span className="del">−{variant.stat.del}</span>
    </span>
  )
}

function Slot({
  variant,
  shown,
  since,
  busy,
  actions,
}: {
  variant: VariantView
  shown: boolean
  since: number
  busy: boolean
  actions: Actions
}) {
  const key = variant.id.slice(1)
  if (variant.state === "failed") {
    const [headline, ...why] = variant.reason.split("\n")
    return (
      <div className="slot failed">
        <span className="key">{key}</span>
        <span
          className="slot-main"
          title={variant.reason}
        >
          <span className="slot-title">{variant.direction.title}</span>
          <span className="slot-sub">{headline}</span>
          {why.map((line) => (
            <span
              key={line}
              className="slot-why mono"
            >
              {line}
            </span>
          ))}
        </span>
        {variant.retryable && (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              actions.retry(variant.id)
            }}
          >
            Retry
          </button>
        )}
      </div>
    )
  }
  const card = (
    <button
      type="button"
      role="radio"
      className="slot"
      aria-checked={shown}
      disabled={variant.state === "pending" || busy}
      onClick={() => {
        actions.flip(variant.id)
      }}
    >
      <span className="key">{key}</span>
      {variant.state === "pending" ? (
        <span className="slot-main">
          <span
            className="slot-title"
            title={variant.direction.description}
          >
            {variant.direction.title}
          </span>
          <Progress
            phase={PHASES[variant.phase]}
            since={since}
          />
        </span>
      ) : (
        <span className="slot-main">
          <span className="slot-title">{variant.title}</span>
          <span
            className="slot-sub clamp"
            title={variant.summary}
          >
            {variant.summary}
          </span>
        </span>
      )}
      {variant.state === "ready" && <Stat variant={variant} />}
    </button>
  )
  if (variant.state !== "ready") return card
  return (
    <div className="slot-wrap">
      {card}
      <button
        type="button"
        className="link refine"
        aria-label={`Refine ${variant.id}`}
        title="Keep it and give feedback · R"
        disabled={busy}
        onClick={() => {
          actions.refine(variant.id)
        }}
      >
        Refine
      </button>
    </div>
  )
}

/** What the designer asked: their words, unless the trail shows them, and their marks in words. */
function Request({ draft, words = true }: { draft: Draft; words?: boolean }) {
  const said = words && draft.words !== ""
  if (!said && draft.marks.length === 0) return null
  return (
    <div className="quote">
      {said && <p>{draft.words}</p>}
      {draft.marks.map((mark) => (
        <p
          key={mark.key}
          className="quote-mark"
        >
          {markLine(mark)}
        </p>
      ))}
    </div>
  )
}

/** The kept variants a round stands on: the last in full, every one in the tooltip. */
export function Trail({ view }: { view: SessionView | null }) {
  const trail = view?.trail ?? []
  const last = trail.at(-1)
  if (last === undefined) return null
  const step = (entry: (typeof trail)[number]) =>
    `from ${entry.variant} “${entry.title}”: ${entry.feedback}`
  return (
    <p
      className="trail"
      title={trail.map((entry, index) => `Round ${index + 2} · ${step(entry)}`).join("\n")}
    >
      <span className="trail-round">Round {trail.length + 1}</span> · {step(last)}
    </p>
  )
}

/** Feedback on the shown variant: words and marks, sent with Enter. */
function Feedback({
  refining,
  ready,
  dispatch,
  actions,
}: {
  refining: Refining
  ready: boolean
  dispatch: Dispatch<Event>
  actions: Actions
}) {
  const label = `What should change about ${refining.variant}?`
  const field = useRef<HTMLTextAreaElement>(null)
  // Refine can open from a card low in the panel or from the pill; the field comes into view.
  useEffect(() => {
    field.current?.scrollIntoView({ block: "nearest" })
    field.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="feedback">
      <textarea
        ref={field}
        className="field"
        placeholder={label}
        aria-label={label}
        value={refining.draft.words}
        rows={2}
        onChange={(event) => {
          dispatch({ kind: "typed", words: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            actions.refine(null)
            return
          }
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          if (ready) actions.sendRefine()
        }}
      />
      <Tools
        tools={SKETCH_TOOLS}
        tool={refining.tool}
        dispatch={dispatch}
      />
      <MarkList
        marks={refining.draft.marks}
        dispatch={dispatch}
      />
    </div>
  )
}

function Session({
  stage,
  dispatch,
  actions,
}: {
  stage: Extract<Stage, { kind: "session" }>
  dispatch: Dispatch<Event>
  actions: Actions
}) {
  const { view, pending, refining } = stage
  const shown = shownOf(view)
  const busy = pending !== null
  const ready = view?.variants.some((variant) => variant.state === "ready") ?? false
  const kept = view?.trail.at(-1)
  return (
    <>
      <div className="body">
        <Request
          draft={stage.draft}
          words={kept === undefined}
        />
        {refining !== null && (
          <Feedback
            key={refining.variant}
            refining={refining}
            ready={canRefine(stage)}
            dispatch={dispatch}
            actions={actions}
          />
        )}
        {view === null ? (
          <p className="hint">
            <span className="spinner" />
            Opening the session…
          </p>
        ) : (
          <div
            className="slots"
            role="radiogroup"
            aria-label="Variants"
          >
            <button
              type="button"
              role="radio"
              className="slot"
              aria-checked={shown === "original"}
              disabled={busy}
              onClick={() => {
                actions.flip("original")
              }}
            >
              <span className="key">0</span>
              <span className="slot-main">
                <span className="slot-title">
                  {kept === undefined ? "Original" : `${kept.variant} (kept)`}
                </span>
                <span className="slot-sub">
                  {kept === undefined ? "The page as it was" : "The page as you kept it"}
                </span>
              </span>
            </button>
            {view.variants.map((variant) => (
              <Slot
                key={variant.id}
                variant={variant}
                shown={shown === variant.id}
                since={stage.retried[variant.id] ?? stage.since}
                busy={busy}
                actions={actions}
              />
            ))}
          </div>
        )}
        {view?.live?.edited && (
          <p className="hint">You edited a shown file. Flipping keeps your edit where it can.</p>
        )}
        {view?.stuck && <p className="notice">Stuck on {view.stuck.join(", ")}.</p>}
        {stage.notice && (
          <p
            className="notice"
            role="alert"
          >
            {stage.notice}
          </p>
        )}
      </div>
      {refining === null ? (
        <SessionFoot
          stage={stage}
          actions={actions}
          ready={ready}
        />
      ) : (
        <div className="foot">
          <span className="hint">Keeps {refining.variant}, then makes 3 more from it</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              actions.refine(null)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!canRefine(stage)}
            onClick={actions.sendRefine}
          >
            Refine <kbd>↵</kbd>
          </button>
        </div>
      )}
    </>
  )
}

function SessionFoot({
  stage,
  actions,
  ready,
}: {
  stage: Extract<Stage, { kind: "session" }>
  actions: Actions
  ready: boolean
}) {
  const { view, pending } = stage
  const shown = shownOf(view)
  const busy = pending !== null
  const kept = view?.trail.at(-1)
  return (
    <div className="foot">
      <span className="hint">
        <kbd>0</kbd>–<kbd>{view?.variants.length ?? 3}</kbd> flip
        {ready && (
          <>
            {" · "}
            <kbd>R</kbd> refine
          </>
        )}
      </span>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={actions.discard}
      >
        {pending?.kind === "discard" ? "Stopping…" : ready ? "Discard" : "Cancel"}
      </button>
      {ready && (
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={shown === "original" ? actions.discard : actions.keep}
        >
          {pending?.kind === "keep"
            ? "Keeping…"
            : shown === "original"
              ? `Keep ${kept?.variant ?? "original"}`
              : "Keep"}
        </button>
      )}
    </div>
  )
}

/** The panel folded out of the way: a key per choice, Refine, Keep and Discard. */
export function Pill({
  stage,
  actions,
  onExpand,
}: {
  stage: Extract<Stage, { kind: "session" }>
  actions: Actions
  onExpand: () => void
}) {
  const { view, pending } = stage
  const shown = shownOf(view)
  const busy = pending !== null
  const variants = view?.variants ?? []
  const ready = variants.some((variant) => variant.state === "ready")
  const choices: { choice: Choice; key: string; ready: boolean; title: string }[] = [
    { choice: "original", key: "0", ready: true, title: "Original" },
    ...variants.map((variant) => ({
      choice: variant.id,
      key: variant.id.slice(1),
      ready: variant.state === "ready",
      title: variant.state === "ready" ? variant.title : variant.direction.title,
    })),
  ]
  return (
    <div className="pill">
      <button
        type="button"
        className="icon"
        aria-label="Unfold Tune"
        title="Unfold"
        onClick={onExpand}
      >
        <Icon name="expand" />
      </button>
      <span
        className="pill-keys"
        role="radiogroup"
        aria-label="Variants"
      >
        {choices.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="radio"
            className="key"
            title={entry.title}
            aria-checked={shown === entry.choice}
            disabled={busy || !entry.ready}
            onClick={() => {
              actions.flip(entry.choice)
            }}
          >
            {entry.key}
          </button>
        ))}
      </span>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={actions.discard}
      >
        {ready ? "Discard" : "Cancel"}
      </button>
      {ready && (
        <button
          type="button"
          className="button"
          title="Refine the shown variant (R)"
          disabled={busy || shown === null || shown === "original"}
          onClick={() => {
            if (shown !== null && shown !== "original") actions.refine(shown)
          }}
        >
          Refine <kbd>R</kbd>
        </button>
      )}
      {ready && (
        <button
          type="button"
          className="button primary"
          disabled={busy || shown === "original"}
          onClick={actions.keep}
        >
          Keep
        </button>
      )}
    </div>
  )
}

/** The header's theme switch, for the page, while a session is open: `Light`, `Dark`. */
export function PageTheme({
  theme,
  themes,
  choose,
}: {
  theme: ThemeName
  themes: ThemeModel
  choose: (theme: ThemeName) => void
}) {
  return (
    <span
      className="segments"
      role="radiogroup"
      aria-label="Page theme"
    >
      {themes.list.map(({ name: option }) => (
        <button
          key={option}
          type="button"
          role="radio"
          className="segment"
          aria-checked={theme === option}
          onClick={() => {
            choose(option)
          }}
        >
          {option.charAt(0).toUpperCase() + option.slice(1).replaceAll("-", " ")}
        </button>
      ))}
    </span>
  )
}

/** The line the panel header shows for a stage. */
export function statusOf(stage: Stage): string {
  if (stage.kind === "composing") return stage.tool === "point" ? "Pointing" : stage.tool === "inspect" ? "Inspecting" : ""
  if (stage.kind === "asking") return "Planning"
  if (stage.kind === "failed") return "Something went wrong"
  if (stage.refining !== null) return `Refining ${stage.refining.variant}`
  const variants = stage.view?.variants ?? []
  const pending = variants.filter((variant) => variant.state === "pending").length
  if (pending > 0) return `${variants.length - pending} of ${variants.length} ready`
  const shown = shownOf(stage.view)
  return shown === null || shown === "original" ? "Showing the original" : `Showing ${shown}`
}

function Failed({
  stage,
  actions,
}: {
  stage: Extract<Stage, { kind: "failed" }>
  actions: Actions
}) {
  const { message, retry, draft } = stage
  return (
    <>
      <div className="body">
        {retry !== null && (
          <>
            <p className="hint">
              Your feedback on {retry.from.variant} “{retry.from.title}”
            </p>
            <Request draft={draft} />
          </>
        )}
        <p
          className="notice"
          role="alert"
        >
          {message}
        </p>
      </div>
      <div className="foot">
        <span className="hint" />
        <button
          type="button"
          className="button"
          onClick={actions.back}
        >
          Back
        </button>
        {retry !== null && (
          <button
            type="button"
            className="button primary"
            onClick={actions.retryRefine}
          >
            Retry
          </button>
        )}
      </div>
    </>
  )
}

export function PanelBody({
  stage,
  dispatch,
  actions,
  theme,
}: {
  stage: Stage
  dispatch: Dispatch<Event>
  actions: Actions
  theme: ShownTheme | null
}) {
  if (stage.kind === "composing")
    return (
      <Composing
        stage={stage}
        dispatch={dispatch}
        actions={actions}
        theme={theme}
      />
    )
  if (stage.kind === "session")
    return (
      <Session
        stage={stage}
        dispatch={dispatch}
        actions={actions}
      />
    )
  if (stage.kind === "failed")
    return (
      <Failed
        stage={stage}
        actions={actions}
      />
    )
  return (
    <>
      <div className="body">
        {stage.from !== null && (
          <p className="hint">
            Refining {stage.from.variant} “{stage.from.title}”
          </p>
        )}
        <Request draft={stage.draft} />
        <div
          className="slots"
          aria-busy="true"
        >
          {["1", "2", "3"].map((key) => (
            <div
              key={key}
              className="slot planning"
            >
              <span className="key">{key}</span>
              <span className="slot-main">
                <span className="slot-title">Finding a direction</span>
                <Progress
                  phase="Planning"
                  since={stage.since}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="foot">
        <span className="hint">Your words and marks come back if you cancel.</span>
        <button
          type="button"
          className="button"
          onClick={actions.cancel}
        >
          Cancel
        </button>
      </div>
    </>
  )
}
