import { useState } from "react"

import type { Stage } from "../stage/stage"
import { LiveBoard } from "./Board"
import { Coach } from "./Coach"
import { Ledger } from "./Ledger"
import { Touch } from "./Touch"
import { Versions } from "./Versions"

const INSTALL = `pnpm add -D "github:enitrat/morph#path:/packages/morph"`
const GITHUB = "https://github.com/enitrat/morph"

function Mark() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
      <rect x="1.5" y="1.5" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7.5" y="7.5" width="11" height="11" rx="5.5" fill="currentColor" />
    </svg>
  )
}

function Keys({ down = false }: { down?: boolean }) {
  return (
    <span className="inline-flex gap-1" aria-label="Option Shift R">
      {["⌥", "⇧", "R"].map((key) => (
        <kbd key={key} className="keycap" data-down={down || undefined}>
          {key}
        </kbd>
      ))}
    </span>
  )
}

/** Sends the overlay's real shortcut, so the visitor sees the keys they will press in their app. */
function pressShortcut() {
  const init = { code: "KeyR", key: "R", altKey: true, shiftKey: true, bubbles: true }
  window.dispatchEvent(new KeyboardEvent("keydown", init))
  window.dispatchEvent(new KeyboardEvent("keyup", init))
}

function Shortcut({ touch }: { touch: boolean }) {
  const [size, setSize] = useState<string | null>(null)
  const [down, setDown] = useState(false)
  return (
    <button
      type="button"
      onMouseEnter={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        setSize(`${Math.round(box.width)} × ${Math.round(box.height)}`)
      }}
      onMouseLeave={() => {
        setSize(null)
      }}
      onClick={() => {
        if (touch) {
          document.getElementById("board")?.scrollIntoView({ behavior: "smooth" })
          return
        }
        setDown(true)
        setTimeout(() => {
          setDown(false)
          pressShortcut()
        }, 140)
      }}
      className="group relative inline-flex items-center gap-3 rounded-xl border border-[#2c2f36] bg-[#16181c] py-[9px] pr-3 pl-4 text-[14px] font-medium text-text transition-colors hover:border-[#3a3e47] hover:bg-[#1a1c21]"
    >
      <span>Try it on the table</span>
      {!touch && <Keys down={down} />}
      {size !== null && (
        <>
          <span className="pointer-events-none absolute -inset-px rounded-xl border border-measure" />
          <span className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded bg-measure px-[5px] py-[3px] font-mono text-[11px]/none whitespace-nowrap text-white">
            {size}
          </span>
        </>
      )}
    </button>
  )
}

function Install() {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-line bg-[#121317] py-2.5 pr-2.5 pl-3.5 font-mono text-[13px]/[1.3] text-[#d9dbe0]">
      <code className="min-w-0 truncate">{INSTALL}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(INSTALL).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          })
        }}
        className="flex-none rounded-[7px] border border-[#2c2f36] bg-[#1a1c21] px-2.5 py-[5px] font-sans text-[12px]/none font-medium text-text hover:border-[#3a3e47]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

export function App({ stage, touch }: { stage: Stage; touch: boolean }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-7 pb-10 sm:px-6">
      <header data-morph className="flex items-center justify-between text-[13px] text-muted">
        <span className="flex items-center gap-2.5 font-serif text-[22px]/none text-text">
          <Mark />
          morph
        </span>
        <a href={GITHUB} className="hover:text-text">
          GitHub
        </a>
      </header>

      <section data-morph className="py-10 text-center sm:pt-10 sm:pb-8">
        <h1 className="font-serif text-[clamp(40px,5vw,64px)]/none tracking-[-0.01em] text-balance">
          Point at anything. <em className="text-[#cfd6e4]">Get three better ones.</em>
        </h1>
        <p className="mx-auto mt-3.5 mb-6 max-w-[520px] text-[15px]/[1.5] text-balance text-muted">
          Morph is a dev overlay for React. Pick an element, say what you want, flip between three
          versions live, keep one. It writes the code.
        </p>
        <Shortcut touch={touch} />
      </section>

      <section id="board">
        <div className="relative">
          <LiveBoard stage={stage} />
          <span
            data-morph
            className="absolute top-3.5 left-3.5 rounded-[7px] bg-[#25272c] px-[9px] py-1.5 text-[12px]/none font-medium text-[#d6d6d1]"
          >
            Try it
          </span>
          <Coach stage={stage} touch={touch} />
        </div>
        {touch && <Touch stage={stage} />}
        <Versions stage={stage} />
        <p data-morph className="mt-4 text-[13px]/[1.45] text-faint">
          <b className="font-medium text-muted">The asks here are hand-designed and replayed.</b> In
          your app, you type anything.
        </p>
        <Ledger stage={stage} />
      </section>

      <footer
        data-morph
        className="mt-20 grid items-center gap-5 border-t border-line pt-7 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <Install />
        <div className="flex items-center gap-5 text-[13px] text-muted">
          {!touch && (
            <span className="flex items-center gap-2">
              <Keys />
              to open
            </span>
          )}
          <a href={GITHUB} className="text-text underline-offset-4 hover:underline">
            github.com/enitrat/morph
          </a>
        </div>
      </footer>
    </div>
  )
}
