import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react"

import { type Display, type Scope } from "../core"
import { reachOf, type Row, type Step } from "../dial/rows"
import { type Dial, type Dialed, deriveRows } from "./dials"
import { Icon } from "./icons"
import { clearPreview, endThemePreview, previewTheme } from "./preview"
import { Props } from "./prop-rows"
import { type ShownTheme } from "./view"

/** Pointer travel per step while dragging a value. */
const DRAG_PX = 12
/** A wheel or button run writes once it has been still this long. */
const SETTLE_MS = 350
const KEY_STEPS: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 4,
  PageDown: -4,
}

const px = (display: Extract<Display, { kind: "length" }>) => Math.round(display.px * 100) / 100

/** `14 px`, or `12 → 14 px` once the dial left the step the code held. */
function textOf(display: Display, step: Step, from?: Step): string {
  if (display.kind === "length")
    return from?.display.kind === "length" && from !== step
      ? `${px(from.display)} → ${px(display)} px`
      : `${px(display)} px`
  if (display.kind === "color") {
    const role = /var\(--(?:color-)?([\w-]+)\)/.exec(step.value)?.[1]
    return role ?? step.value.replace(/^(?:bg|text|border)-/, "")
  }
  return display.text
}

function Value({ step, from }: { step: Step; from: Step | undefined }) {
  const { display } = step
  return (
    <>
      {display.kind === "color" && (
        <span
          className="swatch"
          style={{ background: display.css }}
        />
      )}
      <span className="dial-text num">{textOf(display, step, from)}</span>
    </>
  )
}

/**
 * While a track of a theme the page is not in has the focus, the page shows that theme, so the
 * step is seen; it goes back when the focus leaves.
 */
function useThemeWhileFocused(scope: Scope, theme: ShownTheme) {
  const [focused, setFocused] = useState(false)
  const other = focused && scope !== "all" && scope !== theme.name ? scope : null
  const { themes } = theme
  useEffect(() => {
    if (other === null) return undefined
    previewTheme(themes, other)
    return endThemePreview
  }, [other, themes])
  return {
    onFocus: () => {
      setFocused(true)
    },
    onBlur: (event: FocusEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    },
  }
}

/** `Text colour`, `Padding x`: what a row tunes, without a group heading over it. */
const nameOf = (row: Row) =>
  (row.group === "Text" || row.group === "Border") &&
  !row.label.toLowerCase().startsWith(row.group.toLowerCase())
    ? `${row.group} ${row.label.toLowerCase()}`
    : row.label

/** The dial a row opens on: its narrowest reach. */
const firstDial = ({ row, dials }: Dialed) =>
  row.order.map((scope) => dials[scope]).find((dial) => dial !== undefined)

/** A row folded to one line showing step `at`, the one its dial rests on; a click opens it. */
function RowLine({ row, dials, at, onOpen }: Dialed & { at: number; onOpen: () => void }) {
  const dial = firstDial({ row, dials })
  const step = dial?.track.steps[at]
  if (dial === undefined || step === undefined) return null
  return (
    <button
      type="button"
      className="dial-line"
      aria-expanded="false"
      onClick={onOpen}
    >
      <span className="dial-label">{nameOf(row)}</span>
      <Value
        step={step}
        from={dial.track.steps[dial.track.at]}
      />
    </button>
  )
}

function DialRow({
  row,
  dials,
  theme,
  opened,
}: Dialed & {
  theme: ShownTheme
  /** Opened by a click on its folded line: the value takes the focus. */
  opened: boolean
}) {
  const scopes = row.order.filter((scope) => dials[scope] !== undefined)
  const [scope, setScope] = useState<Scope>(scopes[0] ?? "all")
  const focus = useThemeWhileFocused(scope, theme)
  const dial = dials[scope]
  const reach = reachOf(row, scope)
  if (dial === undefined || reach === undefined) return null
  return (
    <div
      className="dial"
      {...focus}
    >
      <div className="dial-head">
        <span className="dial-label">{nameOf(row)}</span>
        {scopes.length > 1 && (
          <span
            className="segments"
            role="radiogroup"
            aria-label={`What ${row.label.toLowerCase()} changes`}
          >
            {scopes.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                className="segment"
                aria-checked={scope === option}
                onClick={() => {
                  setScope(option)
                }}
              >
                {reachOf(row, option)?.segment}
              </button>
            ))}
          </span>
        )}
      </div>
      <DialControl
        key={scope}
        dial={dial}
        label={nameOf(row)}
        focused={opened}
      >
        <span
          className="dial-source"
          title={reach.detail}
        >
          {reach.line}
        </span>
        {reach.note !== null && <span className="hint">{reach.note}</span>}
        {scope !== "all" && scope !== theme.name && (
          <span className="hint">The page shows {scope} mode while you tune this.</span>
        )}
      </DialControl>
    </div>
  )
}

/**
 * Asks before a far-reaching track writes the step it shows; `onAnswer` gets the step the dial
 * rests on once the designer writes it or undoes it. It scrolls into the panel's view and focuses
 * Write it, since it can open below the fold.
 */
function Confirm({ dial, onAnswer }: { dial: Dial; onAnswer: (at: number) => void }) {
  const box = useRef<HTMLSpanElement>(null)
  const write = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest" })
    write.current?.focus({ preventScroll: true })
  }, [])
  return (
    <span
      ref={box}
      className="confirm"
      role="alert"
    >
      <span>{dial.question}</span>
      <button
        ref={write}
        type="button"
        className="link"
        onClick={() => {
          dial.confirm()
          onAnswer(dial.at)
        }}
      >
        Write it
      </button>
      <button
        type="button"
        className="link quiet"
        onClick={() => {
          onAnswer(dial.revert())
        }}
      >
        Undo
      </button>
    </span>
  )
}

/**
 * A control opened by a click takes the focus; a step left unconfirmed when it closes is not
 * written, so the page drops it too.
 */
function useOpened(dial: Dial, focused: boolean, slider: RefObject<HTMLDivElement | null>) {
  useEffect(
    () => () => {
      if (dial.unconfirmed) dial.revert()
    },
    [dial],
  )
  useEffect(() => {
    if (focused) slider.current?.focus()
  }, [focused, slider])
}

/** A wheel over the value steps it, natively and not passive, instead of scrolling the panel. */
function useWheel(slider: RefObject<HTMLDivElement | null>, onStep: (delta: number) => void) {
  useEffect(() => {
    const element = slider.current
    if (element === null) return undefined
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 1) return
      event.preventDefault()
      onStep(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      element.removeEventListener("wheel", onWheel)
    }
  })
}

/** One track's control; each scope has its own, so switching never shows another's step. */
function DialControl({
  dial,
  label,
  focused,
  children,
}: {
  dial: Dial
  label: string
  /** Takes the focus as it mounts. */
  focused: boolean
  /** What the track reaches, shown under the control. */
  children: ReactNode
}) {
  const [at, setAt] = useState(dial.at)
  // Held as state, since the dial itself changes outside React, where a render cannot see it.
  const [asking, setAsking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const drag = useRef<{ x: number; moved: number } | null>(null)
  const slider = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () =>
      dial.onNotice((message) => {
        setAt(dial.at)
        setNotice(message)
      }),
    [dial],
  )
  useOpened(dial, focused, slider)

  const step = (delta: number) => {
    setNotice(null)
    setAt(dial.step(delta))
    setAsking(dial.unconfirmed)
  }
  const releaseSoon = () => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      dial.release()
    }, SETTLE_MS)
  }

  useWheel(slider, (delta) => {
    step(delta)
    releaseSoon()
  })

  const { track } = dial
  const current = track.steps[at]
  if (current === undefined) return null
  const last = track.steps.length - 1

  const onKeyDown = (event: KeyboardEvent) => {
    const delta =
      event.key === "Home" ? -at : event.key === "End" ? last - at : KEY_STEPS[event.key]
    if (delta === undefined) return
    event.preventDefault()
    event.stopPropagation()
    step(delta)
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, moved: 0 }
  }
  const onPointerMove = (event: PointerEvent) => {
    const now = drag.current
    if (now === null) return
    const steps = Math.trunc((event.clientX - now.x) / DRAG_PX)
    if (steps === now.moved) return
    step(steps - now.moved)
    now.moved = steps
  }
  const onPointerUp = () => {
    if (drag.current === null) return
    drag.current = null
    dial.release()
  }

  return (
    <>
      <div className="dial-control">
        <button
          type="button"
          className="icon"
          aria-label={`Decrease ${label}`}
          disabled={at === 0}
          onClick={() => {
            step(-1)
            releaseSoon()
          }}
        >
          <Icon name="minus" />
        </button>
        <div
          ref={slider}
          role="slider"
          tabIndex={0}
          className="dial-value"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={at}
          aria-valuetext={textOf(current.display, current)}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            if (event.key in KEY_STEPS || event.key === "Home" || event.key === "End")
              dial.release()
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Value
            step={current}
            from={track.steps[track.at]}
          />
        </div>
        <button
          type="button"
          className="icon"
          aria-label={`Increase ${label}`}
          disabled={at === last}
          onClick={() => {
            step(1)
            releaseSoon()
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
      {children}
      {asking && (
        <Confirm
          dial={dial}
          onAnswer={(rest) => {
            setAsking(false)
            setAt(rest)
          }}
        />
      )}
      {notice !== null && (
        <span
          className="notice"
          role="alert"
        >
          {notice}
        </span>
      )}
    </>
  )
}

/**
 * Dials for what the picked element uses, derived once per pick and theme: the caller keys it by
 * both. A step previews outside React and re-renders only its own row; a release writes the code.
 */
export function FineTune({ target, theme }: { target: Element; theme: ShownTheme }) {
  const [rows, setRows] = useState<readonly Dialed[] | string | null>(null)
  // One row open at a time, so the panel stays short and clear of the page.
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    const stop = new AbortController()
    void (async () => {
      const derived = await deriveRows(target, theme.name)
      if (stop.signal.aborted) return
      setRows(derived)
    })()
    return () => {
      stop.abort()
    }
  }, [target, theme.name])
  useEffect(() => clearPreview, [])

  return (
    <div
      className="fine-tune"
      aria-label="Fine-tune"
      role="group"
    >
      <Props target={target} />
      <StyleRows
        rows={rows}
        open={open}
        setOpen={setOpen}
        theme={theme}
      />
    </div>
  )
}

function StyleRows({
  rows,
  open,
  setOpen,
  theme,
}: {
  rows: readonly Dialed[] | string | null
  open: string | null
  setOpen: (key: string) => void
  theme: ShownTheme
}) {
  if (rows === null) return <p className="hint">Reading what it uses…</p>
  if (typeof rows === "string")
    return (
      <p
        className="notice"
        role="alert"
      >
        {rows}
      </p>
    )
  if (rows.length === 0)
    return (
      <p className="hint">Nothing here reads a spacing or colour token. Ask for it in words.</p>
    )
  return rows.map((entry) =>
    entry.row.key === open ? (
      <DialRow
        key={entry.row.key}
        row={entry.row}
        dials={entry.dials}
        theme={theme}
        opened
      />
    ) : (
      <RowLine
        key={entry.row.key}
        row={entry.row}
        dials={entry.dials}
        at={firstDial(entry)?.at ?? 0}
        onOpen={() => {
          // The row closing drops a step it never wrote before its folded line shows it.
          for (const dial of Object.values(
            rows.find((other) => other.row.key === open)?.dials ?? {},
          ))
            if (dial?.unconfirmed) dial.revert()
          setOpen(entry.row.key)
        }}
      />
    ),
  )
}
