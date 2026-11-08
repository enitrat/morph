import { type ReactNode } from "react"

import { type Match } from "../scale"
import { Glyph, type GlyphName } from "./Glyph"

/** A titled block of the inspector, with an optional count or note on the right. */
export function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-line px-3.5 py-3 last:border-b-0">
      <h3 className="mb-2.5 flex items-center font-mono text-[10.5px] font-medium tracking-[0.06em] text-ink-2 uppercase">
        {title}
        <span className="flex-1" />
        {right}
      </h3>
      {children}
    </section>
  )
}

/** A token name, or the nearest one in amber when the value is off the scale. */
export function TokenHint({ match }: { match: Match }) {
  if (match.kind === "none") return null
  return match.kind === "token" ? (
    <span className="font-mono text-[10.5px] text-accent">{match.name}</span>
  ) : (
    <span className="font-mono text-[10.5px] text-warn" title="Off the scale; nearest token">
      ≈ {match.near}
    </span>
  )
}

export function Swatch({ css, large = false }: { css: string; large?: boolean }) {
  return (
    <i
      className={`inline-block flex-none rounded-[3px] shadow-[inset_0_0_0_1px_var(--line)] ${large ? "size-5 rounded-[5px]" : "size-2.5"}`}
      style={{ background: css }}
    />
  )
}

/** The head of a tab: what it reads, with a kicker above the name. */
export function Identity({
  kicker,
  glyph,
  name,
  dims,
  source,
  tone = "plain",
  actions,
}: {
  kicker: string
  glyph?: GlyphName
  name: string
  dims?: string
  source?: string | null
  tone?: "plain" | "preview"
  actions?: ReactNode
}) {
  return (
    <div className="border-b border-line px-3.5 pt-3.5 pb-3">
      <div
        className={`mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] font-medium tracking-[0.06em] uppercase ${
          tone === "preview" ? "text-accent" : "text-ink-2"
        }`}
      >
        {tone === "preview" ? (
          <i className="size-1.5 animate-pulse rounded-full bg-accent" />
        ) : (
          glyph && <Glyph name={glyph} size={12} />
        )}
        {kicker}
        <span className="flex-1" />
        {actions}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[15px] font-semibold text-ink">{name}</span>
        {dims && <span className="tnum font-mono text-[11px] text-ink-2">{dims}</span>}
      </div>
      {source && <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{source}</div>}
    </div>
  )
}

export function IconButton({
  glyph,
  title,
  onClick,
}: {
  glyph: GlyphName
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="ring-focus grid size-6 place-items-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
    >
      <Glyph name={glyph} size={13} />
    </button>
  )
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-4 grid w-16 gap-1.5">
        <i className="h-2 rounded-full bg-surface-3" />
        <i className="h-2 w-10 rounded-full bg-surface-2" />
        <i className="h-2 w-12 rounded-full bg-surface-2" />
      </div>
      <h3 className="mb-1.5 text-[14px] font-semibold text-ink">{title}</h3>
      <div className="text-[12.5px] leading-[18px] text-ink-2">{children}</div>
    </div>
  )
}
