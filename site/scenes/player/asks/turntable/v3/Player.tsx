import type { CSSProperties } from "react"

import { TRACK, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

/** 33⅓ rpm, in degrees per second. */
const RPM = 200

export function Player() {
  const at = usePosition()
  const played = at / TRACK.duration
  return (
    <article
      data-object="player"
      data-layout="turntable"
      className="h-[440px] w-[300px] [--color-accent:#ff6a1f] [--color-ink-2:#8b8781] [--color-ink:#ece9e4] [--color-on-accent:#160a02] [--color-paper:#1a1a1a] [--color-rule:rgb(255_255_255/0.14)] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="relative isolate flex h-full flex-col overflow-hidden rounded-[10px] bg-paper bg-[linear-gradient(180deg,#232323,#141414)] p-4 font-body text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_30px_50px_-24px_rgb(0_0_0/0.95)]"
      >
        <div className="absolute -top-[110px] -left-[150px] size-[400px] rounded-full bg-[#0b0b0b] shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
          <div
            className="absolute inset-[10px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#101010_0_1.3px,#1b1b1b_1.7px_3px)] motion-reduce:rotate-0"
            style={{ "--spin": `${(at * RPM) % 360}deg` } as CSSProperties}
          >
            <div className="absolute top-1/2 left-1/2 size-[124px] -translate-1/2 overflow-hidden rounded-full">
              <PlayerCover />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-[10px] rounded-full bg-[conic-gradient(from_70deg,transparent_0_8%,rgb(255_255_255/0.09)_13%,transparent_19%_55%,rgb(255_255_255/0.07)_61%,transparent_67%)] [mask:radial-gradient(circle,transparent_32%,#000_33%)]" />
          <div className="absolute top-1/2 left-1/2 size-2.5 -translate-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff,#777)]" />
        </div>
        <div
          className="absolute top-[30px] left-[262px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
          style={{ "--arm": `${28 + played * 24}deg` } as CSSProperties}
          aria-hidden
        >
          <span className="absolute -top-[20px] -left-[20px] size-10 rounded-full bg-[radial-gradient(circle_at_40%_35%,#5a5a5a,#2a2a2a_65%,#111)] shadow-[0_6px_14px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.1)]" />
          <svg
            width="40"
            height="252"
            viewBox="0 0 40 252"
            className="absolute -top-[14px] -left-[20px] overflow-visible drop-shadow-[0_6px_6px_rgb(0_0_0/0.6)]"
          >
            <circle cx="20" cy="14" r="7" fill="#3a3a3a" />
            <path
              d="M20 14 L20 218 L12 240"
              fill="none"
              stroke="#3c3c3c"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect
              x="3"
              y="234"
              width="18"
              height="12"
              rx="2"
              fill="var(--color-accent)"
              transform="rotate(22 12 240)"
            />
          </svg>
        </div>
        <div className="relative z-10 mt-auto grid gap-2 before:absolute before:-inset-x-4 before:-top-16 before:-bottom-4 before:-z-10 before:bg-[linear-gradient(transparent,rgb(20_20_20/0.92)_38%)]">
          <p data-role="meta" className="font-num text-[10px] tracking-[0.16em] text-accent">
            A{TRACK.number} · 33⅓ RPM
          </p>
          <h3
            data-role="heading"
            className="font-display text-[34px]/[0.92] font-extrabold tracking-[-0.045em]"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="text-[12px] text-ink-2">
            {TRACK.artist} — {TRACK.album}, {TRACK.year}
          </p>
          <div className="mt-1 grid gap-1.5">
            <PlayerProgress />
            <PlayerControls />
          </div>
        </div>
      </div>
    </article>
  )
}
