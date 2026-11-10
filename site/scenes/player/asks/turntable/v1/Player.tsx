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
      className="h-[440px] w-[300px] -rotate-[0.6deg] [--color-accent:#e9b66c] [--color-ink-2:#cdb595] [--color-ink:#f6ead6] [--color-on-accent:#2a1a0b] [--color-paper:#7a4828] [--color-rule:rgb(246_234_214/0.2)] [--font-body:var(--font-sans)] [--font-display:var(--font-editorial)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col overflow-hidden rounded-[18px] bg-paper bg-[linear-gradient(180deg,rgb(255_255_255/0.1),transparent_30%,rgb(0_0_0/0.28)),repeating-linear-gradient(92deg,rgb(0_0_0/0.08)_0_2px,transparent_2px_7px,rgb(255_220_170/0.05)_7px_9px,transparent_9px_15px),linear-gradient(100deg,#6b3f22,#8a5530_30%,#6e4024_55%,#8f5a33_80%,#6a3d20)] p-4 font-body text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),inset_0_-6px_14px_rgb(0_0_0/0.35),0_30px_50px_-24px_rgb(0_0_0/0.9)]"
      >
        <div className="relative h-[236px] shrink-0">
          <div className="absolute top-0 left-0 size-[228px] rounded-full bg-[conic-gradient(#9a9a9a,#e8e8e8,#8d8d8d,#d9d9d9,#9a9a9a)] shadow-[0_10px_24px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.4)]">
            <div
              className="absolute inset-[8px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#121212_0_1.2px,#1d1d1d_1.6px_2.8px)] shadow-[inset_0_0_0_5px_#0c0c0c,inset_0_0_0_6px_#2a2a2a] motion-reduce:rotate-0"
              style={{ "--spin": `${(at * RPM) % 360}deg` } as CSSProperties}
            >
              <div className="absolute top-1/2 left-1/2 size-[80px] -translate-1/2 overflow-hidden rounded-full">
                <PlayerCover />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-[8px] rounded-full bg-[conic-gradient(from_25deg,transparent_0_6%,rgb(255_255_255/0.13)_11%,transparent_17%_52%,rgb(255_255_255/0.1)_58%,transparent_64%)] [mask:radial-gradient(circle,transparent_37%,#000_38%)]" />
            <div className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff,#888)]" />
          </div>
          <Tonearm angle={25 + played * 18} />
          <p className="absolute right-0 bottom-1 flex gap-1 font-num text-[9px] font-semibold">
            <span className="rounded-[3px] px-1.5 py-1 text-accent shadow-[inset_0_0_0_1px_currentColor]">
              33
            </span>
            <span className="rounded-[3px] px-1.5 py-1 text-ink-2 opacity-60 shadow-[inset_0_0_0_1px_currentColor]">
              45
            </span>
          </p>
        </div>
        <header className="mt-3 min-w-0">
          <p data-role="meta" className="font-num text-[10px] tracking-[0.14em] text-ink-2">
            SIDE A · 0{TRACK.number} · 33⅓
          </p>
          <h3
            data-role="heading"
            className="mt-1 truncate font-display text-[24px]/[1.05] font-semibold tracking-[-0.01em]"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="truncate text-[12px] text-ink-2">
            {TRACK.artist} · {TRACK.album}
          </p>
        </header>
        <div className="mt-auto grid gap-1.5">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}

/** The arm swings in from its post as the song plays through: 25° on the lead-in, 43° at the label. */
function Tonearm({ angle }: { angle: number }) {
  return (
    <div
      className="absolute top-[22px] left-[250px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
      style={{ "--arm": `${angle}deg` } as CSSProperties}
      aria-hidden
    >
      <span className="absolute -top-[22px] -left-[22px] size-11 rounded-full bg-[radial-gradient(circle_at_40%_35%,#f2f2f2,#9c9c9c_60%,#6d6d6d)] shadow-[0_6px_12px_rgb(0_0_0/0.4)]" />
      <svg
        width="40"
        height="214"
        viewBox="0 0 40 214"
        className="absolute -top-[14px] -left-[20px] overflow-visible drop-shadow-[0_6px_6px_rgb(0_0_0/0.4)]"
      >
        <circle cx="20" cy="14" r="8" fill="#d8d8d8" stroke="#777" />
        <path
          d="M20 14 L20 176 L11 198"
          fill="none"
          stroke="#e6e6e6"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="2"
          y="192"
          width="18"
          height="14"
          rx="2.5"
          fill="#2b2b2b"
          transform="rotate(22 11 199)"
        />
      </svg>
    </div>
  )
}
