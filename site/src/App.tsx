import { useState } from "react"

import type { Stage } from "../stage/stage"
import { LiveBoard } from "./Board"
import { Coach } from "./Coach"
import { Ledger } from "./Ledger"
import { Touch } from "./Touch"

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
      className="group relative inline-flex flex-none items-center gap-3 rounded-[10px] border border-[#2c2f36] py-[9px] pr-3 pl-4 text-[14px] font-medium text-text transition-colors hover:border-[#3a3e47] hover:bg-[#16181c]"
    >
      <span>Try it</span>
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
    <div className="flex max-w-full min-w-0 items-center gap-2.5 rounded-[10px] border border-[#2c2f36] bg-[#121317] py-[7px] pr-[7px] pl-3.5 text-left font-mono text-[13px]/[1.3] text-[#d9dbe0]">
      <code className="min-w-0 truncate">{INSTALL}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(INSTALL).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          })
        }}
        className="flex-none rounded-[6px] bg-text px-3 py-[7px] font-sans text-[12.5px]/none font-semibold text-page transition-colors hover:bg-white"
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

      <section data-morph className="flex flex-col items-center py-10 text-center sm:pt-12">
        <h1 className="font-serif text-[clamp(40px,5vw,64px)]/none tracking-[-0.01em] text-balance">
          Point at it. <em className="text-[#cfd6e4]">Ask for changes.</em>
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px]/[1.5] text-pretty text-muted">
          A dev overlay for React. Press ⌥⇧R, click an element, say what you want, and flip between
          three versions on your live page. Keep one, and it’s in your code.
        </p>
        <div className="mt-7 flex max-w-full flex-col items-center gap-3">
          <Install />
          {!touch && <Shortcut touch={touch} />}
        </div>
      </section>

      <section id="board">
        <div className="relative">
          <LiveBoard stage={stage} />
          <Coach stage={stage} touch={touch} />
        </div>
        {touch && <Touch stage={stage} />}
        <Ledger stage={stage} />
      </section>
    </div>
  )
}
