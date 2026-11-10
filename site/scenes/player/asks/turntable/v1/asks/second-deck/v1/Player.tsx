import type { CSSProperties, ReactNode } from "react"

import { NEXT_TRACK, TRACK, usePlayback, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

/** 33⅓ rpm, in degrees per second. */
const RPM = 200

export function Player() {
  const at = usePosition()
  const { playing } = usePlayback()
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
        <header className="min-w-0">
          <p data-role="meta" className="font-num text-[10px] tracking-[0.14em] text-ink-2">
            A → B · MIXING AT 84 BPM
          </p>
          <h3
            data-role="heading"
            className="mt-1 truncate font-display text-[21px]/[1.05] font-semibold tracking-[-0.01em]"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="truncate text-[11.5px] text-ink-2">
            into “{NEXT_TRACK.title}”
          </p>
        </header>
        <div className="mt-3 flex justify-between">
          <Deck spin={at * RPM} arm={10 + played * 18} side="A">
            <PlayerCover />
          </Deck>
          <Deck spin={at * RPM * 0.94 + 120} arm={12} side="B">
            <span className="grid size-full place-items-center bg-[radial-gradient(circle,#f2efe6_0_14%,#e3242b_15%)] font-num text-[5px] font-bold tracking-[0.1em] text-white/85">
              <span className="-translate-y-[13px]">STATIC BLOOM</span>
            </span>
          </Deck>
        </div>
        <div className="mt-2.5 grid grid-cols-[14px_1fr_14px] items-center gap-3 rounded-[8px] bg-black/30 px-3 py-2.5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5),0_1px_0_rgb(255_255_255/0.08)]">
          <Meter
            level={playing ? 0.55 + 0.4 * Math.abs(Math.sin(at * 7.3)) : 0}
            fade={1 - played}
          />
          <div className="grid gap-1.5">
            <div className="relative h-2 rounded-full bg-black/50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]">
              <span
                className="absolute top-1/2 h-4 w-7 -translate-1/2 rounded-[3px] bg-[linear-gradient(#f2f2f2,#a9a9a9)] shadow-[0_2px_4px_rgb(0_0_0/0.5)] after:absolute after:inset-y-1 after:left-1/2 after:w-px after:bg-black/60"
                style={{ left: `${8 + played * 84}%` }}
              />
            </div>
            <p className="flex justify-between font-num text-[8.5px] tracking-[0.14em] text-ink-2">
              <span>A</span>
              <span>X-FADE</span>
              <span>B</span>
            </p>
          </div>
          <Meter level={playing ? 0.5 + 0.4 * Math.abs(Math.sin(at * 5.1 + 1)) : 0} fade={played} />
        </div>
        <div className="mt-auto grid gap-1.5">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}

/** A 128 px deck: platter, record, the label in `children`, and an arm that tracks `arm` degrees. */
function Deck({
  spin,
  arm,
  side,
  children,
}: {
  spin: number
  arm: number
  side: string
  children: ReactNode
}) {
  return (
    <div className="relative size-[128px]">
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(#9a9a9a,#e8e8e8,#8d8d8d,#d9d9d9,#9a9a9a)] shadow-[0_8px_16px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.4)]">
        <div
          className="absolute inset-[5px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#121212_0_1px,#1d1d1d_1.4px_2.4px)] shadow-[inset_0_0_0_3px_#0c0c0c] motion-reduce:rotate-0"
          style={{ "--spin": `${spin % 360}deg` } as CSSProperties}
        >
          <div className="absolute top-1/2 left-1/2 size-[44px] -translate-1/2 overflow-hidden rounded-full">
            {children}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-[5px] rounded-full bg-[conic-gradient(from_25deg,transparent_0_6%,rgb(255_255_255/0.13)_11%,transparent_17%_52%,rgb(255_255_255/0.1)_58%,transparent_64%)] [mask:radial-gradient(circle,transparent_37%,#000_38%)]" />
      </div>
      <div
        className="absolute top-[6px] left-[122px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
        style={{ "--arm": `${arm}deg` } as CSSProperties}
        aria-hidden
      >
        <span className="absolute -top-[11px] -left-[11px] size-[22px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#f2f2f2,#9c9c9c_60%,#6d6d6d)] shadow-[0_3px_6px_rgb(0_0_0/0.4)]" />
        <svg
          width="30"
          height="112"
          viewBox="0 0 30 112"
          className="absolute -top-[10px] -left-[15px] overflow-visible drop-shadow-[0_3px_3px_rgb(0_0_0/0.4)]"
        >
          <path
            d="M15 10 L15 88 L10 100"
            fill="none"
            stroke="#e6e6e6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="3"
            y="96"
            width="11"
            height="8"
            rx="1.5"
            fill="#2b2b2b"
            transform="rotate(22 8 100)"
          />
        </svg>
      </div>
      <span className="absolute bottom-0 -left-0.5 font-num text-[9px] font-bold text-accent">
        {side}
      </span>
    </div>
  )
}

/** A level meter of eight segments; `fade` is the channel's fader, 0 to 1. */
function Meter({ level, fade }: { level: number; fade: number }) {
  const lit = Math.round(level * fade * 8)
  return (
    <span className="grid h-10 grid-rows-8 gap-px" aria-hidden>
      {Array.from({ length: 8 }, (_, segment) => (
        <i
          key={segment}
          className={`rounded-[1px] ${7 - segment < lit ? (segment < 2 ? "bg-[#ff5a3c]" : "bg-[#9ee37d]") : "bg-white/10"}`}
        />
      ))}
    </span>
  )
}
