import { type Dispatch, useMemo } from "react"

import { type Finding, samplesIn, sheetOf } from "../frame"
import { type Event, type Frame } from "../model"
import { type Scales } from "../scale"
import { fmt, hexOf } from "../specs"
import { nameOf } from "../tree"
import { Glyph } from "./Glyph"
import { useSource } from "./hooks"
import { frameBox } from "./PageLayer"
import { IconButton, Identity, Section, Swatch } from "./parts"

/** The frame's items grouped by name, the most repeated first. */
export function groupsOf(frame: Frame) {
  const groups = new Map<string, Element[]>()
  for (const item of frame.items)
    groups.set(nameOf(item), [...(groups.get(nameOf(item)) ?? []), item])
  return [...groups]
    .map(([name, elements]) => ({ name, elements }))
    .toSorted((a, b) => b.elements.length - a.elements.length)
}

function Group({
  name,
  elements,
  on,
  dispatch,
}: {
  name: string
  elements: Element[]
  on: boolean
  dispatch: Dispatch<Event>
}) {
  const source = useSource(elements[0] ?? null)
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`ring-focus flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150 ${
        on
          ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--ring)]"
          : "text-ink hover:bg-surface-2"
      }`}
      onPointerOver={() => {
        dispatch({ kind: "hovered", hover: { via: "sheet", elements } })
      }}
      onPointerOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          dispatch({ kind: "hovered", hover: null })
      }}
      onClick={() => {
        dispatch({ kind: "narrowed", name })
      }}
    >
      <i className="size-2.5 flex-none rounded-[2px] shadow-[inset_0_0_0_1.5px_var(--accent)]" />
      <span className="truncate font-medium">{name}</span>
      {source && (
        <span className="truncate font-mono text-[10.5px] text-ink-3">
          {source.path.split("/").at(-1)}
        </span>
      )}
      <span className="flex-1" />
      <span className="tnum font-mono text-[11px] text-ink-2">×{elements.length}</span>
    </button>
  )
}

function FindingRow({
  finding,
  frame,
  dispatch,
}: {
  finding: Finding
  frame: Frame
  dispatch: Dispatch<Event>
}) {
  return (
    <div
      className="group flex gap-2.5 rounded-md px-2 py-2 hover:bg-warn-soft"
      onPointerOver={() => {
        dispatch({ kind: "hovered", hover: { via: "sheet", elements: finding.elements } })
      }}
      onPointerOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          dispatch({ kind: "hovered", hover: null })
      }}
    >
      <span className="pt-px text-warn">
        <Glyph name="warn" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink">{finding.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-ink-2">
          {finding.swatches.length > 0
            ? finding.swatches.map((css) => (
                <span key={css} className="flex items-center gap-1">
                  <Swatch css={css} />
                  {hexOf(css)}
                </span>
              ))
            : finding.detail}
        </div>
        {finding.instances.length > 0 && (
          <div className="mt-1.5 grid gap-0.5">
            {finding.instances.slice(0, 3).map((instance, i) => (
              <button
                key={i}
                type="button"
                className="ring-focus flex items-baseline gap-1.5 truncate rounded-xs py-0.5 text-left font-mono text-[10.5px] text-ink-2 hover:text-ink"
                onPointerOver={(event) => {
                  event.stopPropagation()
                  dispatch({
                    kind: "hovered",
                    hover: { via: "sheet", elements: instance.elements },
                  })
                }}
                onClick={() => {
                  if (instance.owner) dispatch({ kind: "selected", element: instance.owner })
                }}
              >
                <b className="font-sans text-[11.5px] font-medium text-ink">
                  {instance.owner ? nameOf(instance.owner) : "Page"}
                </b>
                {instance.prop}
                {instance.elements.length > 1 && ` ×${instance.elements.length}`}
                <span className="text-warn">
                  {instance.value.startsWith("rgb") ? hexOf(instance.value) : instance.value}
                </span>
                {instance.near && <span className="text-accent">→ {instance.near}</span>}
              </button>
            ))}
            {finding.instances.length > 3 && (
              <span className="font-mono text-[10.5px] text-ink-3">
                +{finding.instances.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="ring-focus h-6 self-start rounded-md px-2 text-[11.5px] font-semibold text-warn shadow-[inset_0_0_0_1px_rgb(245_177_74/0.45)] hover:bg-warn hover:text-on-warn"
        onClick={() => {
          dispatch({
            kind: "ask",
            target: { kind: "frame", frame },
            words: finding.fix,
            tool: null,
          })
        }}
      >
        Fix
      </button>
    </div>
  )
}

/** A frame's read-out: what is off the system first, then what it holds. */
export function FrameSheet({
  frame,
  scales,
  dispatch,
}: {
  frame: Frame
  scales: Scales
  dispatch: Dispatch<Event>
}) {
  // Measured when the frame is drawn, against the page as it was then.
  const sheet = useMemo(
    () => sheetOf(samplesIn(frameBox(frame)), scales, frame.items.length),
    [frame.rect, frame.items, scales],
  )
  const groups = groupsOf(frame)
  const narrowed =
    frame.narrow === null ? null : groups.find((group) => group.name === frame.narrow)
  const max = Math.max(1, ...sheet.spacing.map((bucket) => bucket.px))
  const onScale = sheet.spacing.filter((bucket) => bucket.token !== null).length
  return (
    <>
      <Identity
        kicker="Frame"
        glyph="frame"
        name={
          narrowed
            ? `${narrowed.name} ×${narrowed.elements.length}`
            : `${frame.items.length} component${frame.items.length === 1 ? "" : "s"}`
        }
        dims={`${fmt(frame.rect.width)}×${fmt(frame.rect.height)}`}
        source={`${groups.length} kinds · ${sheet.measured} elements measured`}
        actions={
          <IconButton
            glyph="x"
            title="Clear frame  esc"
            onClick={() => {
              dispatch({ kind: "deselected" })
            }}
          />
        }
      />
      {sheet.findings.length > 0 && (
        <Section
          title="Off-system"
          right={<span className="text-warn">{sheet.findings.length}</span>}
        >
          <div className="-mx-2 grid gap-0.5">
            {sheet.findings.map((finding) => (
              <FindingRow key={finding.key} finding={finding} frame={frame} dispatch={dispatch} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title="Contents"
        right={
          <span className="normal-case tracking-normal text-ink-3">
            {frame.narrow ? "click again to widen" : "click to narrow"}
          </span>
        }
      >
        <div className="-mx-2 grid gap-0.5">
          {groups.map((group) => (
            <Group
              key={group.name}
              {...group}
              on={frame.narrow === group.name}
              dispatch={dispatch}
            />
          ))}
        </div>
      </Section>
      <Section
        title="Spacing"
        right={
          sheet.spacing.length > 0 && (
            <span className={onScale < sheet.spacing.length ? "text-warn" : "text-accent"}>
              {onScale}/{sheet.spacing.length} on scale
            </span>
          )
        }
      >
        {sheet.spacing.length === 0 ? (
          <span className="text-[12px] text-ink-3">No spacing inside this frame.</span>
        ) : (
          <div className="grid grid-cols-[32px_1fr_auto_28px] items-center gap-x-2.5 gap-y-1.5 font-mono text-[11px]">
            {sheet.spacing.map((bucket) => (
              <div key={bucket.px} className="contents">
                <span className="tnum text-right text-ink">{fmt(bucket.px)}</span>
                <span className="h-2 overflow-hidden rounded-[2px]">
                  <i
                    className={`block h-full rounded-[2px] ${bucket.token ? "hatch" : "bg-warn/70"}`}
                    style={{ width: `${Math.max(3, (bucket.px / max) * 100)}%` }}
                  />
                </span>
                <span className={bucket.token ? "text-accent" : "text-warn"}>
                  {bucket.token ?? (bucket.near ? `→ ${bucket.near}` : "raw")}
                </span>
                <span className="tnum text-right text-ink-3">×{bucket.count}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Radii">
        {sheet.radii.length === 0 ? (
          <span className="text-[12px] text-ink-3">No rounded corners.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sheet.radii.map((bucket) => (
              <span
                key={bucket.px}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-ink shadow-[inset_0_0_0_1px_var(--line)]"
              >
                <i
                  className="size-3 border-t-[1.5px] border-l-[1.5px] border-ink-2"
                  style={{ borderTopLeftRadius: Math.min(bucket.px, 12) }}
                />
                {fmt(bucket.px)}
                <span className={bucket.token ? "text-accent" : "text-warn"}>
                  {bucket.token ?? "raw"}
                </span>
                <span className="text-ink-3">×{bucket.count}</span>
              </span>
            ))}
          </div>
        )}
      </Section>
      <Section title="Colour" right={<span>{sheet.colors.length}</span>}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {sheet.colors.slice(0, 10).map((color) => (
            <div key={color.css} className="flex min-w-0 items-center gap-2">
              <Swatch css={color.css} large />
              <div className="min-w-0 font-mono text-[10.5px] leading-[14px]">
                <div className="text-ink">{hexOf(color.css)}</div>
                <div className={`truncate ${color.role ? "text-accent" : "text-warn"}`}>
                  {color.role ?? "raw"} · {color.uses.join(", ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Type styles" right={<span>{sheet.types.length}</span>}>
        <div className="grid gap-2">
          {sheet.types.slice(0, 5).map((type, i) => (
            <div key={i} className="flex min-w-0 items-baseline gap-3">
              <span
                className="min-w-0 flex-1 truncate text-ink"
                style={{
                  fontSize: Math.min(type.size, 20),
                  fontWeight: type.weight,
                  fontFamily: `${type.family}, system-ui, sans-serif`,
                }}
              >
                {type.sample}
              </span>
              <span className="tnum flex-none font-mono text-[10.5px] text-ink-2">
                {fmt(type.size)}/
                {type.lineHeight === "normal" ? "n" : fmt(Number.parseFloat(type.lineHeight))} ·{" "}
                {type.weight}
                {type.count > 1 && ` ×${type.count}`}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}
