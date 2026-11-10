import { type Dispatch, type ReactNode } from "react"

import { instanceName, isComponentName, propsOf, rootedAt } from "../../inspector/fiber"
import { type Event } from "../model"
import { matchOf, type Scales } from "../scale"
import { type VariantId } from "../../variant/model"
import { letterOf } from "../sessions"
import { type Change, deltaOf, fmt, hexOf, quadText, specOf, type Spec, usesOf } from "../specs"
import { childrenOf, nameOf, pathOf } from "../tree"
import { useSource } from "./hooks"
import { Kbd } from "./Kbd"
import { IconButton, Identity, Section, Swatch, TokenHint } from "./parts"

/** The primitive props the component instance at this element was rendered with. */
function propsAt(element: Element): [string, string | number | boolean][] {
  const instance = rootedAt(element).findLast((entry) => isComponentName(instanceName(entry)))
  if (instance === undefined) return []
  return Object.entries(propsOf(instance)).flatMap(([key, value]) =>
    key !== "children" &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      ? [[key, value] as [string, string | number | boolean]]
      : [],
  )
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface-solid/60 px-2.5 py-2">
      <div className="text-[11px] text-ink-2">{label}</div>
      <div className="tnum truncate font-mono text-[12px] text-ink">{value}</div>
      <div className="h-4 truncate">{hint}</div>
    </div>
  )
}

function BoxModel({ spec }: { spec: Spec }) {
  const [mt, mr, mb, ml] = spec.margin
  const [pt, pr, pb, pl] = spec.padding
  const n = (value: number) => (
    <span className={value ? "text-ink" : "text-ink-3"}>{fmt(value)}</span>
  )
  return (
    <div className="tnum relative mt-2 grid grid-cols-[28px_1fr_28px] grid-rows-[20px_auto_20px] items-center rounded-md px-1 text-center font-mono text-[10.5px] shadow-[inset_0_0_0_1px_var(--line)] [background:repeating-linear-gradient(135deg,transparent_0_5px,rgb(160_190_255/0.04)_5px_6px)]">
      <span className="absolute top-1 left-2 text-[9px] tracking-[0.06em] text-ink-3 uppercase">
        margin
      </span>
      <span className="col-start-2">{n(mt)}</span>
      <span className="row-start-2">{n(ml)}</span>
      <div className="relative col-start-2 row-start-2 grid grid-cols-[28px_1fr_28px] grid-rows-[20px_auto_20px] items-center rounded-[5px] bg-measure-soft shadow-[inset_0_0_0_1px_rgb(255_61_139/0.5)]">
        <span className="absolute top-1 left-2 text-[9px] tracking-[0.06em] text-measure uppercase">
          padding
        </span>
        <span className="col-start-2">{n(pt)}</span>
        <span className="row-start-2">{n(pl)}</span>
        <div className="col-start-2 row-start-2 rounded-[4px] bg-surface-solid px-2 py-1.5 text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          {fmt(spec.width - pl - pr - spec.border[1] - spec.border[3])} ×{" "}
          {fmt(spec.height - pt - pb - spec.border[0] - spec.border[2])}
        </div>
        <span className="row-start-2">{n(pr)}</span>
        <span className="col-start-2 row-start-3">{n(pb)}</span>
      </div>
      <span className="row-start-2">{n(mr)}</span>
      <span className="col-start-2 row-start-3">{n(mb)}</span>
    </div>
  )
}

/** A variant on the page over this element, and the original as Morph last measured it. */
export interface Shown {
  n: number
  variant: VariantId
  baseline: Spec | null
}

function ChangeRow({ change }: { change: Change }) {
  const was =
    change.kind === "length"
      ? fmt(change.was)
      : change.kind === "color"
        ? change.was === null
          ? "none"
          : hexOf(change.was)
        : change.was
  const now =
    change.kind === "length"
      ? fmt(change.now)
      : change.kind === "color"
        ? change.now === null
          ? "none"
          : hexOf(change.now)
        : change.now
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2 py-[3px] text-[12px]">
      <span className="truncate text-ink-2">{change.label}</span>
      <span className="tnum flex min-w-0 items-center gap-1 truncate font-mono text-[11.5px]">
        {change.kind === "color" && change.was && <Swatch css={change.was} />}
        <s className="text-ink-3">{was}</s>
        <span className="text-ink-3">→</span>
        {change.kind === "color" && change.now && <Swatch css={change.now} />}
        <span className="text-ink">{now}</span>
      </span>
      {change.kind === "length" ? (
        change.match.kind === "off" ? (
          <span
            className="font-mono text-[10.5px] text-warn"
            title={`Nearest token ${change.match.near}`}
          >
            off-scale
          </span>
        ) : (
          <TokenHint match={change.match} />
        )
      ) : change.kind === "color" ? (
        <span className={`font-mono text-[10.5px] ${change.role ? "text-accent" : "text-warn"}`}>
          {change.role ?? "raw"}
        </span>
      ) : null}
    </div>
  )
}

/** What the variant on the page changed here, against the original's measurement. */
function Delta({ shown, spec, scales }: { shown: Shown; spec: Spec; scales: Scales }) {
  const changes = shown.baseline === null ? null : deltaOf(shown.baseline, spec, scales)
  const off = changes?.filter((change) => change.kind === "length" && change.match.kind === "off")
  return (
    <section className="m-2.5 mb-0 rounded-lg bg-accent-soft px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--ring)]">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-accent">
        <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-on-accent">
          {shown.n}
        </span>
        Variant {letterOf(shown.variant)}
        <span className="font-normal text-ink-2">vs original</span>
        <span className="flex-1" />
        {changes && (
          <span className="font-mono text-[10.5px] font-normal text-ink-2">
            {changes.length} change{changes.length === 1 ? "" : "s"}
            {off && off.length > 0 && <span className="text-warn"> · {off.length} off-scale</span>}
          </span>
        )}
      </h3>
      {changes === null ? (
        <p className="text-[12px] leading-[17px] text-ink-2">
          No baseline yet. Morph measures the original while it is on the page: flip to <Kbd>0</Kbd>{" "}
          once to measure it.
        </p>
      ) : changes.length === 0 ? (
        <p className="text-[12px] text-ink-2">Nothing measurable changed on this element.</p>
      ) : (
        changes.map((change) => <ChangeRow key={change.label} change={change} />)
      )}
    </section>
  )
}

/** Specs for one element: identity, layout, box model, tokens, type and props. */
export function ElementSpecs({
  element,
  preview,
  shown = null,
  scales,
  dispatch,
}: {
  element: Element
  preview: boolean
  shown?: Shown | null
  scales: Scales
  dispatch: Dispatch<Event>
}) {
  const spec = specOf(element)
  const source = useSource(element)
  const path = pathOf(element)
  const children = childrenOf(element, 7)
  const uses = usesOf(spec, scales)
  const tokenized = uses.filter((use) =>
    use.kind === "length" ? use.match.kind === "token" : use.role !== null,
  ).length
  const props = propsAt(element)
  const pads = [...new Set(spec.padding.filter((value) => value > 0))]
  const lineHeight =
    spec.font.lineHeight === "normal" ? "normal" : fmt(Number.parseFloat(spec.font.lineHeight))
  const select = (target: Element) => () => {
    dispatch({ kind: "selected", element: target })
  }
  return (
    <>
      <Identity
        kicker={preview ? "Preview · click to inspect" : "Element"}
        glyph="comp"
        tone={preview ? "preview" : "plain"}
        name={nameOf(element)}
        dims={`${fmt(spec.width)}×${fmt(spec.height)}`}
        source={source ? `${source.path}:${source.line}` : null}
        actions={
          !preview && (
            <>
              {path.length > 0 && (
                <IconButton
                  glyph="up"
                  title="Parent  ⇧↵"
                  onClick={select(path.at(-1) as Element)}
                />
              )}
              {children[0] && (
                <IconButton glyph="down" title="First child  ↵" onClick={select(children[0])} />
              )}
            </>
          )
        }
      />
      {(path.length > 0 || children.length > 0) && (
        <div className="grid gap-1 border-b border-line px-3.5 py-2.5 text-[12px]">
          {path.length > 0 && (
            <Crumbs
              label="Path"
              items={path.slice(-3)}
              dispatch={dispatch}
              trail={nameOf(element)}
            />
          )}
          {children.length > 0 && (
            <Crumbs
              label="Inside"
              items={children.slice(0, 6)}
              dispatch={dispatch}
              more={children.length > 6}
            />
          )}
        </div>
      )}
      {shown && <Delta shown={shown} spec={spec} scales={scales} />}
      <Section title="Layout">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line shadow-[0_0_0_1px_var(--line)]">
          <Cell label="Width" value={fmt(spec.width)} />
          <Cell label="Height" value={fmt(spec.height)} />
          <Cell label="Display" value={spec.display} />
          <Cell
            label="Gap"
            value={spec.gap === null ? "–" : fmt(spec.gap)}
            hint={spec.gap ? <TokenHint match={matchOf(spec.gap, scales.space)} /> : null}
          />
          <Cell
            label="Padding"
            value={quadText(spec.padding)}
            hint={
              <span className="flex gap-1.5">
                {pads.map((value) => (
                  <TokenHint key={value} match={matchOf(value, scales.space)} />
                ))}
              </span>
            }
          />
          <Cell
            label="Radius"
            value={spec.radius >= 500 ? "pill" : fmt(spec.radius)}
            hint={<TokenHint match={matchOf(spec.radius, scales.radius)} />}
          />
        </div>
        <BoxModel spec={spec} />
      </Section>
      <Section
        title="Tokens"
        right={
          uses.length > 0 && (
            <span
              className={`normal-case tracking-normal ${tokenized < uses.length ? "text-warn" : "text-accent"}`}
            >
              {tokenized}/{uses.length} tokenized
            </span>
          )
        }
      >
        {uses.length === 0 ? (
          <span className="text-[12px] text-ink-3">
            No spacing, radius or colour on this element.
          </span>
        ) : (
          <div className="grid gap-1.5">
            {uses.map((use, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="flex flex-1 items-center gap-1.5 text-ink-2">
                  {use.kind === "color" && <Swatch css={use.css} />}
                  {use.prop}
                </span>
                <span className="tnum font-mono text-[11.5px] text-ink">
                  {use.kind === "color" ? hexOf(use.css) : `${fmt(use.px)}px`}
                </span>
                {use.kind === "length" ? (
                  <TokenHint match={use.match} />
                ) : use.role !== null ? (
                  <span className="font-mono text-[10.5px] text-accent">{use.role}</span>
                ) : scales.colors.size > 0 ? (
                  <span className="font-mono text-[10.5px] text-warn">raw</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Type">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 flex-none place-items-center rounded-md bg-surface-2 text-[20px] text-ink shadow-[inset_0_0_0_1px_var(--line)]"
            style={{
              fontFamily: `${spec.font.family}, system-ui, sans-serif`,
              fontWeight: spec.font.weight,
            }}
          >
            Aa
          </span>
          <div className="min-w-0">
            <div className="tnum font-mono text-[12px] text-ink">
              {fmt(spec.font.size)} / {lineHeight} · {spec.font.weight}
            </div>
            <div className="truncate text-[11.5px] text-ink-2">
              {spec.font.family}
              {spec.font.letterSpacing !== "normal" ? ` · ${spec.font.letterSpacing}` : ""}
            </div>
          </div>
        </div>
      </Section>
      {props.length > 0 && (
        <Section title="Props">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11.5px]">
            {props.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-ink-2">{key}</dt>
                <dd className="truncate text-ink">
                  {typeof value === "string" ? `"${value}"` : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  )
}

function Crumbs({
  label,
  items,
  dispatch,
  trail,
  more = false,
}: {
  label: string
  items: readonly Element[]
  dispatch: Dispatch<Event>
  trail?: string
  more?: boolean
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="w-12 flex-none text-[11px] text-ink-3">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {items.map((item, i) => (
          <span key={i} className="flex items-baseline gap-1.5">
            <button
              type="button"
              className="ring-focus max-w-40 truncate text-ink-2 hover:text-ink hover:underline hover:underline-offset-2"
              onPointerOver={() => {
                dispatch({ kind: "hovered", hover: { via: "layers", element: item } })
              }}
              onPointerOut={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  dispatch({ kind: "hovered", hover: null })
              }}
              onClick={() => {
                dispatch({ kind: "selected", element: item })
              }}
            >
              {nameOf(item)}
            </button>
            {trail !== undefined && <span className="text-ink-3">/</span>}
          </span>
        ))}
        {trail !== undefined && <b className="font-medium text-ink">{trail}</b>}
        {more && <span className="text-ink-3">…</span>}
      </span>
    </div>
  )
}
