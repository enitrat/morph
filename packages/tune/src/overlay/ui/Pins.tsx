import { AnimatePresence, motion } from "motion/react"
import { type Dispatch, type ReactNode, useEffect, useEffectEvent, useReducer, useRef } from "react"

import {
  type Choice,
  type SessionView,
  type VariantId,
  type VariantView,
} from "../../variant/model"
import { type SessionActions } from "../ask"
import { targetsOf } from "../live"
import { type Event, type State } from "../model"
import { type Box, boxOf, cardSpot, PIN, pinSpots, type Point } from "../place"
import {
  doneOf,
  filesText,
  holdersOf,
  isGenerating,
  letterOf,
  phaseLabel,
  type Pin,
  pinned,
  progressOf,
  type Sessions,
  statusOf,
} from "../sessions"
import { Glyph } from "./Glyph"
import { useSize } from "./hooks"
import { Kbd } from "./Kbd"
import { appear } from "./lib/motion"
import { type Area } from "./PageLayer"

const CARD_WIDTH = 340

/** The box around everything a pin is about, in viewport pixels. */
export function boxOfPin(pin: Pin): Box | null {
  const boxes = targetsOf(pin).map((element) => boxOf(element.getBoundingClientRect()))
  if (boxes.length === 0) return null
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  }
}

const layoutKey = (boxes: readonly (Box | null)[]) =>
  [
    scrollX | 0,
    scrollY | 0,
    innerWidth,
    innerHeight,
    ...boxes.map((box) =>
      box ? `${box.left | 0},${box.top | 0},${box.right | 0},${box.bottom | 0}` : "-",
    ),
  ].join("|")

/** The choices a card flips through with ←/→: the original, then each ready variant. */
export const choicesOf = (view: SessionView): Choice[] => [
  "original",
  ...view.variants.flatMap((variant) => (variant.state === "ready" ? [variant.id] : [])),
]

/** What the page shows for the session, or waits to show. */
export function currentOf(view: SessionView): Choice | null {
  const { place } = view
  if (place.kind === "shown" || place.kind === "waiting") return place.variant
  if (place.kind === "conflict") return place.showing
  return "original"
}

/** The variant Keep names: the one shown, the one waited for (keep takes over), or the one a conflict left on the page. */
export function keepable(view: SessionView): VariantId | null {
  const { place } = view
  if (place.kind === "shown" || place.kind === "waiting") return place.variant
  if (place.kind === "conflict") return place.showing
  return null
}

function Ring({
  progress,
  size = PIN,
  stroke = 2.5,
}: {
  progress: number
  size?: number
  stroke?: number
}) {
  const r = size / 2 - stroke / 2
  const length = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${length * Math.max(0.04, progress)} ${length}`}
        className="transition-[stroke-dasharray] duration-500"
      />
    </svg>
  )
}

/** A pin's disc: its number, a ring while it generates, tinted once a variant is on the page. */
export function Disc({
  pin,
  view,
  size = PIN,
}: {
  pin: Pin
  view: SessionView | null
  size?: number
}) {
  const status = statusOf(view)
  const generating = view === null || isGenerating(view)
  const tone =
    status.tone === "on"
      ? "bg-accent text-on-accent"
      : status.tone === "warn"
        ? "bg-surface-solid text-warn shadow-[inset_0_0_0_1.5px_var(--warn)]"
        : "bg-surface-solid text-ink shadow-[inset_0_0_0_1px_var(--line)]"
  return (
    <span
      className={`relative grid flex-none place-items-center rounded-full font-semibold tnum ${tone}`}
      style={{ width: size, height: size, fontSize: size > 20 ? 12 : 10.5 }}
    >
      {generating && status.tone !== "on" && (
        <Ring
          progress={view === null ? 0 : progressOf(view)}
          size={size}
          stroke={size > 20 ? 2.5 : 2}
        />
      )}
      <span className="relative">{pin.n}</span>
    </span>
  )
}

function PinButton({
  pin,
  view,
  at,
  active,
  dispatch,
}: {
  pin: Pin
  view: SessionView | null
  at: Point
  active: boolean
  dispatch: Dispatch<Event>
}) {
  const status = statusOf(view)
  const shown = view?.place.kind === "shown" ? letterOf(view.place.variant) : null
  return (
    <motion.button
      type="button"
      aria-label={`Pin ${pin.n}, ${pin.name}, ${status.label}`}
      title={`${pin.name} · ${status.label}`}
      onClick={() => {
        dispatch({ kind: "card", id: active ? null : pin.id })
      }}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      className={`ring-focus pointer-events-auto absolute rounded-full shadow-[0_4px_12px_-4px_rgb(0_0_0/0.6)] ${
        active ? "outline-2 outline-offset-2 outline-accent" : ""
      }`}
      style={{ left: at.x, top: at.y }}
    >
      <Disc pin={pin} view={view} />
      {shown !== null && (
        <span className="absolute -right-1.5 -bottom-1.5 grid h-4 min-w-4 place-items-center rounded-[4px] bg-surface-solid px-0.5 font-mono text-[10px] font-semibold text-accent shadow-[inset_0_0_0_1px_var(--ring)]">
          {shown}
        </span>
      )}
      {status.tone === "warn" && (
        <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-warn text-on-warn">
          <Glyph name="warn" size={9} />
        </span>
      )}
    </motion.button>
  )
}

/** A subtle sweep over a target while its variants generate. */
function Scan({ box }: { box: Box }) {
  return (
    <div
      className="absolute overflow-hidden rounded-[3px] shadow-[inset_0_0_0_1px_rgb(124_196_255/0.35)]"
      style={{
        left: box.left,
        top: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      }}
    >
      <div className="tune-scan absolute inset-x-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgb(124_196_255/0.10)_70%,rgb(124_196_255/0.22))]" />
    </div>
  )
}

function Note({ tone, children }: { tone: "warn" | "plain"; children: ReactNode }) {
  return (
    <div
      className={`flex gap-2 rounded-lg px-2.5 py-2 text-[12px] leading-[17px] ${
        tone === "warn"
          ? "bg-warn-soft text-warn shadow-[inset_0_0_0_1px_rgb(245_177_74/0.35)]"
          : "bg-surface-2 text-ink-2"
      }`}
    >
      <span className="mt-px">
        <Glyph name={tone === "warn" ? "warn" : "specs"} size={13} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** What the card says about where the session stands, beyond its rows. */
function PlaceNotes({ view, pins }: { view: SessionView; pins: Sessions["pins"] }) {
  const { place } = view
  const notes: ReactNode[] = []
  if (place.kind === "waiting")
    notes.push(
      <Note key="wait" tone="warn">
        <b className="font-semibold">Waiting for {holdersOf(place.on, pins)}.</b>{" "}
        {letterOf(place.variant)} shows once those files are free. Flip a variant here to take them
        back.
      </Note>,
    )
  if (place.kind === "conflict")
    notes.push(
      <Note key="conflict" tone="warn">
        <b className="font-semibold">Can't move {filesText(place.files)}.</b>{" "}
        {place.showing === null
          ? `The same lines changed since this was asked. Flip to another variant or the original.`
          : `You edited the lines ${letterOf(place.showing)} wrote. Keep ${letterOf(place.showing)} with your edits, or undo them and flip again.`}
      </Note>,
    )
  if (place.kind === "shown" && place.edited)
    notes.push(
      <Note key="edited" tone="plain">
        You edited {letterOf(place.variant)} by hand. Flipping away keeps your edits where they
        merge.
      </Note>,
    )
  if (view.drift.length > 0)
    notes.push(
      <Note key="drift" tone="plain">
        {filesText(view.drift)} changed since this was asked. Showing a variant merges onto it.
      </Note>,
    )
  return notes.length > 0 ? <div className="grid gap-1.5">{notes}</div> : null
}

function Row({
  letter,
  title,
  sub,
  meta,
  on,
  waiting,
  disabled,
  onClick,
}: {
  letter: string
  title: string
  sub: string
  meta: ReactNode
  on: boolean
  waiting: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`ring-focus grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ${
        on
          ? "bg-accent-soft shadow-[inset_0_0_0_1px_var(--ring)]"
          : waiting
            ? "bg-warn-soft shadow-[inset_0_0_0_1px_rgb(245_177_74/0.35)]"
            : "hover:bg-surface-2 disabled:hover:bg-transparent"
      }`}
    >
      <span
        className={`grid size-[22px] place-items-center rounded-md font-mono text-[11px] font-semibold ${
          on ? "bg-accent text-on-accent" : "bg-surface-2 text-ink-2"
        }`}
      >
        {letter}
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-[12.5px] font-medium ${disabled ? "text-ink-2" : "text-ink"}`}
        >
          {title}
        </span>
        <span className="block truncate text-[11.5px] text-ink-3">{sub}</span>
      </span>
      <span className="flex items-center gap-1.5">{meta}</span>
    </button>
  )
}

function VariantRow({
  variant,
  index,
  view,
  actions,
}: {
  variant: VariantView
  index: number
  view: SessionView
  actions: SessionActions
}) {
  const current = currentOf(view)
  const waiting = view.place.kind === "waiting" && view.place.variant === variant.id
  const letter = letterOf(variant.id)
  if (variant.state === "pending")
    return (
      <Row
        letter={letter}
        title={variant.direction.title}
        sub={`${phaseLabel(variant.phase)}…`}
        on={false}
        waiting={false}
        disabled
        onClick={() => {}}
        meta={
          <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-3">
            <i
              className="block h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${Math.round(doneOf(variant) * 100)}%` }}
            />
          </span>
        }
      />
    )
  if (variant.state === "failed")
    return (
      <Row
        letter={letter}
        title={variant.direction.title}
        sub={variant.reason.split("\n")[0] ?? "Failed"}
        on={false}
        waiting={false}
        disabled={!variant.retryable}
        onClick={() => {
          actions.retry(view.id, variant.id)
        }}
        meta={
          variant.retryable ? (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink">
              Retry
            </span>
          ) : (
            <span className="text-[11px] text-warn">failed</span>
          )
        }
      />
    )
  return (
    <Row
      letter={letter}
      title={variant.title}
      sub={variant.summary}
      on={current === variant.id && view.place.kind !== "waiting"}
      waiting={waiting}
      disabled={false}
      onClick={() => {
        actions.show(view.id, variant.id)
      }}
      meta={
        <>
          <span className="tnum font-mono text-[11px] text-[var(--add)]">+{variant.stat.add}</span>
          <span className="tnum font-mono text-[11px] text-[var(--del)]">−{variant.stat.del}</span>
          <Kbd>{String(index + 1)}</Kbd>
        </>
      }
    />
  )
}

function ThreadCard({
  pin,
  view,
  sessions,
  box,
  pinAt,
  area,
  actions,
  dispatch,
}: {
  pin: Pin
  view: SessionView | null
  sessions: Sessions
  box: Box | null
  pinAt: Point | null
  area: Area
  actions: SessionActions
  dispatch: Dispatch<Event>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const spot = cardSpot(box, size ?? { width: CARD_WIDTH, height: 320 }, area, {
    width: innerWidth,
    height: innerHeight,
  })
  const keep = view && keepable(view)
  const from = view?.place.kind === "shown" ? view.place.variant : null
  const round = (view?.trail.length ?? 0) + 1
  const last = view?.trail.at(-1)
  const ready = view?.variants.filter((variant) => variant.state === "ready").length ?? 0
  const tether =
    spot.docked && pinAt !== null && size !== null
      ? { from: { x: pinAt.x + PIN / 2, y: pinAt.y + PIN / 2 }, to: nearestOn(spot, size, pinAt) }
      : null
  return (
    <>
      {tether && (
        <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <line
            x1={tether.from.x}
            y1={tether.from.y}
            x2={tether.to.x}
            y2={tether.to.y}
            stroke="var(--accent)"
            strokeWidth={1.25}
            strokeDasharray="3 4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <motion.div
        ref={ref}
        {...appear}
        role="dialog"
        aria-label={`Pin ${pin.n}, ${pin.name}`}
        className="glass pointer-events-auto absolute grid gap-2.5 rounded-xl p-3"
        style={{
          left: spot.x,
          top: spot.y,
          width: CARD_WIDTH,
          visibility: size ? "visible" : "hidden",
        }}
      >
        <div className="flex items-center gap-2">
          <Disc pin={pin} view={view} size={20} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{pin.name}</span>
          {pin.file && (
            <span className="truncate font-mono text-[11px] text-ink-3">{pin.file}</span>
          )}
          <span className="flex-1" />
          {round > 1 && (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
              R{round}
            </span>
          )}
          <button
            type="button"
            aria-label="Close"
            title="Close  esc"
            onClick={() => {
              dispatch({ kind: "card", id: null })
            }}
            className="ring-focus grid size-6 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Glyph name="x" size={12} />
          </button>
        </div>
        <p className="text-[12.5px] leading-[18px] text-ink">“{pin.words}”</p>
        {last && (
          <p className="truncate text-[11.5px] text-ink-3">
            Built on {letterOf(last.variant)} · {last.title}
          </p>
        )}
        {view === null ? (
          <p className="text-[12px] text-ink-2">Planning three directions…</p>
        ) : (
          <>
            <PlaceNotes view={view} pins={sessions.pins} />
            <div className="grid gap-0.5">
              <Row
                letter={last ? letterOf(last.variant) : "–"}
                title={last ? "As kept last round" : "Original"}
                sub={pin.file ? `As written in ${pin.file}` : "As written"}
                on={currentOf(view) === "original"}
                waiting={false}
                disabled={false}
                onClick={() => {
                  actions.show(view.id, "original")
                }}
                meta={<Kbd>0</Kbd>}
              />
              {view.variants.map((variant, index) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  index={index}
                  view={view}
                  actions={actions}
                />
              ))}
            </div>
          </>
        )}
        <label className="flex h-8 items-center gap-2 rounded-lg bg-[rgb(0_0_0/0.25)] px-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
          <Glyph name="ask" size={13} />
          <input
            value={pin.refine}
            disabled={from === null}
            placeholder={
              from === null ? "Refine once a variant shows…" : `Refine from ${letterOf(from)}…`
            }
            aria-label="Refine"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
            onChange={(event) => {
              dispatch({ kind: "refining", id: pin.id, words: event.target.value })
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && from !== null) {
                event.preventDefault()
                actions.refine(pin, from)
              } else if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.blur()
              }
            }}
          />
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              actions.discard(pin.id)
            }}
            className="ring-focus h-7 rounded-md px-2 text-[12.5px] font-medium text-[var(--del)] hover:bg-surface-2"
          >
            Discard
          </button>
          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-ink-3">
            {view !== null && isGenerating(view)
              ? `${ready} of ${view.variants.length} ready`
              : view?.place.kind === "waiting"
                ? "Keep takes the files"
                : "←/→ flip"}
          </span>
          <button
            type="button"
            disabled={keep == null}
            onClick={() => {
              if (keep != null) actions.keep(pin, keep)
            }}
            className="ring-focus flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-on-accent transition-transform duration-150 active:scale-[0.97] disabled:opacity-40"
          >
            <Glyph name="check" size={12} />
            Keep{keep != null ? ` ${letterOf(keep)}` : ""}
          </button>
        </div>
      </motion.div>
    </>
  )
}

/** The point on the card's edge nearest `to`, where its tether meets it. */
function nearestOn(spot: Point, size: { width: number; height: number }, to: Point): Point {
  const x = Math.max(spot.x, Math.min(to.x + PIN / 2, spot.x + size.width))
  const y = Math.max(spot.y, Math.min(to.y + PIN / 2, spot.y + size.height))
  return { x, y }
}

/** Numbered pins on each session's target, the scan while it generates, and the open card. */
export function Pins({
  state,
  area,
  actions,
  dispatch,
}: {
  state: State
  area: Area
  actions: SessionActions
  dispatch: Dispatch<Event>
}) {
  const { sessions } = state
  const list = pinned(sessions)
  const boxes = list.map(({ pin }) => boxOfPin(pin))
  const spots = pinSpots(boxes, area, { width: innerWidth, height: innerHeight })
  const open = sessions.card
  const openAt = list.findIndex(({ pin }) => pin.id === open)

  // A chip or [ ] focuses a pin whose target may be off screen: bring it into view.
  useEffect(() => {
    const entry = list[openAt]
    if (entry === undefined) return
    const target = targetsOf(entry.pin)[0]
    if (target === undefined) return
    const box = target.getBoundingClientRect()
    if (box.top < 60 || box.top > innerHeight - 280)
      scrollTo({
        top: scrollY + box.top - 120,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only when the open card changes.
  }, [open])

  // Pins follow their targets as the page scrolls, resizes or reloads a variant.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const drawn = layoutKey(boxes)
  const stale = useEffectEvent(
    () => layoutKey(pinned(sessions).map(({ pin }) => boxOfPin(pin))) !== drawn,
  )
  useEffect(() => {
    let raf = 0
    const check = () => {
      if (stale()) bump()
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])

  const entry = list[openAt]
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483641] overflow-hidden">
      {list.map(({ pin, view }, index) => {
        const box = boxes[index]
        return box && (view === null || isGenerating(view)) && pin.id !== open ? (
          <Scan key={`scan-${pin.id}`} box={box} />
        ) : null
      })}
      <AnimatePresence>
        {list.map(({ pin, view }, index) => {
          const at = spots[index]
          return at ? (
            <PinButton
              key={pin.n}
              pin={pin}
              view={view}
              at={at}
              active={pin.id === open}
              dispatch={dispatch}
            />
          ) : null
        })}
      </AnimatePresence>
      <AnimatePresence>
        {entry && (
          <ThreadCard
            key={entry.pin.n}
            pin={entry.pin}
            view={entry.view}
            sessions={sessions}
            box={boxes[openAt] ?? null}
            pinAt={spots[openAt] ?? null}
            area={area}
            actions={actions}
            dispatch={dispatch}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
