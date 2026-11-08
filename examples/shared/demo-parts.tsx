import type { ReactNode } from "react"

export type PinState = "off" | "run" | "half" | "ready" | "kept"
export type Variant = "orig" | "A" | "B"

const PATHS = {
  ask: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  tune: "M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M9 13v6",
  specs: "M4 16L16 4l4 4L8 20zM9 9l2 2M12 6l2 2",
  sketch: "M4 20l4-1 11-11-3-3L5 16z",
  check: "M5 12.5l4.5 4.5L19 7",
  close: "M6 6l12 12M18 6L6 18",
  send: "M12 19V6M6.5 11.5L12 6l5.5 5.5",
  logo: "M6 7h12M12 7v11",
}

export function Glyph({ name, size = 12 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Marks({ name, size }: { name: string; size: string }) {
  return (
    <>
      <i className="d-tag">
        <b>{name}</b> <code>{size}</code>
      </i>
      <span className="d-handles" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    </>
  )
}

export function Ring({ state, ms }: { state: PinState; ms: number }) {
  return (
    <svg className="d-ring" viewBox="0 0 28 28" aria-hidden data-state={state}>
      <circle className="d-ring-track" cx="14" cy="14" r="12" />
      <circle className="d-ring-fill" cx="14" cy="14" r="12" style={{ animationDuration: `${ms}ms` }} />
    </svg>
  )
}

export function Pin({ n, state, ms, letter }: { n: number; state: PinState; ms: number; letter?: string }) {
  if (state === "off") return null
  return (
    <span className="d-pin" data-state={state}>
      <Ring state={state} ms={ms} />
      <span className="d-pin-n">
        {state === "kept" ? <Glyph name="check" size={11} /> : n}
      </span>
      {letter && state !== "run" && state !== "half" && <span className="d-pin-letter">{letter}</span>}
    </span>
  )
}

export function Chip({
  n,
  name,
  state,
  ms,
  letter,
}: {
  n: number
  name: string
  state: PinState
  ms: number
  letter: string
}) {
  const working = state === "run" || state === "half"
  return (
    <span className="d-chip" data-state={state}>
      <span className="d-chip-n">
        <Ring state={state} ms={ms} />
        {n}
      </span>
      {name}
      <i>{working ? "0/3" : state === "kept" ? "kept" : letter}</i>
    </span>
  )
}

export function SessionBar({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="d-session" data-show={show}>
      <span className="d-logo">
        <Glyph name="logo" size={13} />
      </span>
      {children}
    </div>
  )
}

export function ActionBar({ file, side }: { file: string; side: "below" | "above" }) {
  return (
    <div className="d-bar" data-side={side}>
      <code>{file}</code>
      <span className="d-bar-sep" />
      <span data-target="ask">
        <Glyph name="ask" /> Ask <kbd>A</kbd>
      </span>
      <span>
        <Glyph name="tune" /> Tune <kbd>T</kbd>
      </span>
      <span>
        <Glyph name="specs" /> Specs <kbd>S</kbd>
      </span>
      <span>
        <Glyph name="sketch" /> Sketch <kbd>K</kbd>
      </span>
    </div>
  )
}

export function Composer({ text, side }: { text: string; side: "below" | "above" }) {
  return (
    <div className="d-compose" data-side={side}>
      <Glyph name="ask" size={13} />
      <span className="d-compose-text">
        {text}
        <i className="d-caret" />
      </span>
      <span className="d-send" data-target="send">
        <Glyph name="send" size={12} />
      </span>
    </div>
  )
}

const ROWS = [
  { key: "orig", tag: "–", title: "Original", plus: "", minus: "", idx: "0" },
  { key: "A", tag: "A", title: "Larger icon tile, bolder title", plus: "+3", minus: "−3", idx: "1" },
  { key: "B", tag: "B", title: "Oversized tile beside heading", plus: "+10", minus: "−8", idx: "2" },
  { key: "C", tag: "C", title: "Filled icon tile, headline title", plus: "+4", minus: "−4", idx: "3" },
] as const

export function VariantCard({
  open,
  variant,
  specs,
  quote,
}: {
  open: boolean
  variant: Variant
  specs: boolean
  quote: string
}) {
  return (
    <div className="d-card" data-open={open} data-specs={specs}>
      <div className="d-card-head">
        <span className="d-card-n">1</span>
        <b>FeatureCard</b>
        <code>card.tsx</code>
        <Glyph name="close" size={11} />
      </div>
      <p className="d-card-quote">“{quote}”</p>
      <ul>
        {ROWS.map((row) => (
          <li
            key={row.key}
            data-on={row.key === variant}
            data-target={row.key === "B" ? "rowB" : undefined}
          >
            <span className="d-card-tag">{row.tag}</span>
            <span className="d-card-title">{row.title}</span>
            <span className="d-card-stat">
              <em>{row.plus}</em> <s>{row.minus}</s>
            </span>
            <span className="d-card-idx">{row.idx}</span>
          </li>
        ))}
      </ul>
      <div className="d-card-delta" data-show={specs}>
        <span>icon</span>
        <code>
          36 → 56 <u>size-14</u>
        </code>
      </div>
      <div className="d-card-foot">
        <span className="d-discard">Discard</span>
        <span className="d-flip">←/→ flip</span>
        <span className="d-keep" data-target="keep">
          <Glyph name="check" size={11} /> Keep B
        </span>
      </div>
    </div>
  )
}

export function Sidebar({ show }: { show: boolean }) {
  return (
    <aside className="d-side" data-show={show}>
      <div className="d-side-tabs">
        <b>
          Specs <kbd>S</kbd>
        </b>
        <span>
          Tune <kbd>T</kbd>
        </span>
        <span>
          Layers <kbd>L</kbd>
        </span>
      </div>
      <div className="d-side-label">ELEMENT</div>
      <div className="d-side-el">
        <b>FeatureCard</b> <code>213×112</code>
      </div>
      <code className="d-side-file">card.tsx:6</code>
      <div className="d-delta">
        <div className="d-delta-head">
          <span className="d-card-n">1</span>
          <b>Variant B</b>
          <span>vs original</span>
        </div>
        <div className="d-delta-row">
          <span>icon</span>
          <code>
            <s>36</s> → 56
          </code>
          <u>size-14</u>
        </div>
        <div className="d-delta-row">
          <span>gap</span>
          <code>
            <s>12</s> → 16
          </code>
          <u>space-4</u>
        </div>
      </div>
      <div className="d-side-label">LAYOUT</div>
      <div className="d-side-grid">
        <span>
          Width<b>213</b>
        </span>
        <span>
          Height<b>112</b>
        </span>
      </div>
      <div className="d-side-label">TOKENS</div>
      <div className="d-side-tok">
        <span>
          padding <code>12px 14px</code>
        </span>
        <span>
          radius <code>10px</code>
        </span>
        <span>
          gap <code>8px</code>
        </span>
      </div>
    </aside>
  )
}
