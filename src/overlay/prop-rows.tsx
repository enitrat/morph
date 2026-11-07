import { useEffect, useRef, useState } from "react"

import { type PropValue, writeOf } from "../dial/props"
import { type SourceLoc } from "../variant/model"
import { bridge, explain } from "./bridge"
import { deriveProps, type InstanceProps, type PropRow, type PropSite, type Wrapper } from "./props"

/** A segmented control up to this many options; a select past it. */
const SEGMENTS_MAX = 5

const labelOf = (name: string) =>
  name.charAt(0).toUpperCase() +
  name
    .slice(1)
    .replaceAll(/([A-Z])/g, " $1")
    .toLowerCase()

/** `save-button.tsx:29`: the call site a row writes, by file name. */
const whereOf = (site: SourceLoc) => `${site.path.split("/").at(-1) ?? site.path}:${site.line}`

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

/** `every SaveButton in the product (6 uses, 1 lab example)` */
function everyOf({ name, uses, examples }: Wrapper): string {
  const lab = examples > 0 ? `, ${counted(examples, "lab example")}` : ""
  return `every ${name} in the product (${counted(uses, "use")}${lab})`
}

/** The site a write lands on and what it reaches beyond the picked instance. */
function reachOf(at: PropSite): string {
  const where = `Writes ${whereOf(at.site)}`
  if (at.wrapper !== null) return `${where}, ${everyOf(at.wrapper)}`
  return at.places > 1 ? `${where}, ${counted(at.places, "place")} on this page` : where
}

/** The question a write asks first when it changes more than the picked instance. */
function askOf({ wrapper, places }: PropSite): string | null {
  if (wrapper !== null) return `This changes ${everyOf(wrapper)}. Write it?`
  return places > 1 ? `This changes ${places} places. Write it?` : null
}

/** Sites whose reach the designer confirmed, by site and prop, so each is asked once per page. */
const confirmedReach = new Set<string>()

const reachKey = ({ control, at }: PropRow) =>
  at === null ? "" : `${at.site.path}:${at.site.line}:${at.site.col} ${control.name}`

function Choices({
  row,
  disabled,
  choose,
}: {
  row: PropRow
  disabled: boolean
  choose: (value: PropValue) => void
}) {
  const { control, value } = row
  const label = labelOf(control.name)
  if (control.kind === "boolean")
    return (
      <button
        type="button"
        role="switch"
        className="switch"
        aria-label={label}
        aria-checked={value === true}
        disabled={disabled}
        onClick={() => {
          choose(value !== true)
        }}
      />
    )
  if (control.options.length > SEGMENTS_MAX)
    return (
      <select
        className="select"
        aria-label={label}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          choose(event.target.value)
        }}
      >
        {control.options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
      </select>
    )
  return (
    <span
      className="segments"
      role="radiogroup"
      aria-label={label}
    >
      {control.options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          className="segment"
          aria-checked={value === option}
          disabled={disabled}
          onClick={() => {
            choose(option)
          }}
        >
          {option}
        </button>
      ))}
    </span>
  )
}

/** The value and literal a write replaced, which Undo writes back. */
interface Before {
  value: PropValue
  written: PropValue | null
}

/**
 * One prop: a click writes the call site at once and HMR repaints the page. A site that renders
 * several instances, or sits in a component rendered in several places, asks first, once per page
 * session; Undo writes back the value it replaced.
 */
function PropLine({
  component,
  initial,
  shared,
}: {
  component: string
  initial: PropRow
  /** The site and reach the group names, which a row writing elsewhere names under itself. */
  shared: string | null
}) {
  const [row, setRow] = useState(initial)
  const [writing, setWriting] = useState(false)
  const [asking, setAsking] = useState<{ value: PropValue; question: string } | null>(null)
  const [before, setBefore] = useState<Before | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const { control, at } = row
  const label = labelOf(control.name)

  const write = async (value: PropValue, to: PropValue | null, undo: Before | null) => {
    if (at === null) return
    setWriting(true)
    setRefused(null)
    const answer = await bridge.prop({
      site: at.site,
      tag: at.tag,
      component,
      name: control.name,
      to,
    })
    setWriting(false)
    if (!answer.ok) {
      setRefused(explain(answer.error))
      return
    }
    setRow({ control, value, at: { ...at, site: answer.value.site, written: to } })
    setBefore(undo)
  }
  const choose = (value: PropValue) => {
    if (at === null || value === row.value) return
    const question = askOf(at)
    if (question !== null && !confirmedReach.has(reachKey(row))) {
      setAsking({ value, question })
      return
    }
    void write(value, writeOf(control, value), { value: row.value, written: at.written })
  }

  return (
    <div className="prop">
      <div className="prop-head">
        <span className="dial-label">{label}</span>
        <Choices
          row={asking === null ? row : { ...row, value: asking.value }}
          disabled={at === null || writing}
          choose={choose}
        />
      </div>
      {at === null && <span className="hint">Set by the code around it</span>}
      {at !== null && reachOf(at) !== shared && <span className="dial-source">{reachOf(at)}</span>}
      {asking !== null && at !== null && (
        <Ask
          question={asking.question}
          onWrite={() => {
            confirmedReach.add(reachKey(row))
            setAsking(null)
            void write(asking.value, writeOf(control, asking.value), {
              value: row.value,
              written: at.written,
            })
          }}
          onCancel={() => {
            setAsking(null)
          }}
        />
      )}
      {before !== null && at !== null && asking === null && (
        <span className="prop-done">
          <span className="hint">
            {label} {String(before.value)} → {String(row.value)}
          </span>
          <button
            type="button"
            className="link"
            disabled={writing}
            onClick={() => {
              void write(before.value, before.written, null)
            }}
          >
            Undo
          </button>
        </span>
      )}
      {refused !== null && (
        <span
          className="notice"
          role="alert"
        >
          {refused}
        </span>
      )}
    </div>
  )
}

function Ask({
  question,
  onWrite,
  onCancel,
}: {
  question: string
  onWrite: () => void
  onCancel: () => void
}) {
  const write = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    write.current?.scrollIntoView({ block: "nearest" })
    write.current?.focus({ preventScroll: true })
  }, [])
  return (
    <span
      className="confirm"
      role="alert"
    >
      <span>{question}</span>
      <button
        ref={write}
        type="button"
        className="link"
        onClick={onWrite}
      >
        Write it
      </button>
      <button
        type="button"
        className="link quiet"
        onClick={onCancel}
      >
        Cancel
      </button>
    </span>
  )
}

/** The props of the picked component instance, from its lab controls; nothing for other picks. */
export function Props({ target }: { target: Element }) {
  const [props, setProps] = useState<InstanceProps | string | null | undefined>(undefined)
  useEffect(() => {
    const stop = new AbortController()
    void (async () => {
      const derived = await deriveProps(target)
      if (!stop.signal.aborted) setProps(derived)
    })()
    return () => {
      stop.abort()
    }
  }, [target])
  if (props === undefined || props === null) return null
  if (typeof props === "string")
    return (
      <p
        className="notice"
        role="alert"
      >
        {props}
      </p>
    )
  const first = props.rows.find((row) => row.at !== null)?.at
  const shared = first ? reachOf(first) : null
  return (
    <div
      className="props"
      role="group"
      aria-label={`${props.component} props`}
    >
      <span className="group-label">{props.component} props</span>
      {shared !== null && <span className="dial-source">{shared}</span>}
      {props.rows.map((row) => (
        <PropLine
          key={row.control.name}
          component={props.component}
          initial={row}
          shared={shared}
        />
      ))}
    </div>
  )
}
