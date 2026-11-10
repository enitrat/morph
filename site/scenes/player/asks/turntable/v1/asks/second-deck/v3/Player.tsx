import type { CSSProperties, ReactNode } from "react"

import { clock, NEXT_TRACK, TRACK, usePlayback, usePosition } from "./data"
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
        <header className="text-center">
          <p data-role="meta" className="font-num text-[9.5px] tracking-[0.16em] text-ink-2">
            DECK A <span className="text-accent">VS</span> DECK B
          </p>
          <h3
            data-role="heading"
            className="mt-1.5 truncate font-display text-[22px]/[1.05] font-semibold"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="truncate font-display text-[13px] text-ink-2 italic">
            versus {NEXT_TRACK.title}
          </p>
        </header>
        <div className="mt-4 flex items-center justify-between">
          <Deck spin={at * RPM} arm={8 + played * 20}>
            <PlayerCover />
          </Deck>
          <div className="flex h-[108px] w-[48px] flex-col items-center justify-between rounded-[6px] bg-black/35 py-2 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5),0_1px_0_rgb(255_255_255/0.08)]">
            <span className="rounded-[3px] bg-[#140b05] px-1 py-0.5 font-num text-[10px] text-[#ff6b3d] tabular-nums [text-shadow:0_0_6px_rgb(255_107_61/0.6)]">
              {clock(at)}
            </span>
            <span className="flex gap-1.5">
              <Knob turn={playing ? 40 + Math.sin(at * 2) * 30 : 0} />
              <Knob turn={-30} />
            </span>
            <span className="relative h-1.5 w-9 rounded-full bg-black/55">
              <i
                className="absolute top-1/2 h-3 w-2 -translate-1/2 rounded-[2px] bg-[linear-gradient(#f2f2f2,#a9a9a9)]"
                style={{ left: `${10 + played * 80}%` }}
              />
            </span>
          </div>
          <div className="-scale-x-100">
            <Deck spin={-(at * RPM * 0.94) - 120} arm={10}>
              <span className="block size-full -scale-x-100 bg-[radial-gradient(circle,#f2efe6_0_14%,#f2b705_15%)]" />
            </Deck>
          </div>
        </div>
        <p className="mt-2 flex justify-between px-1 font-num text-[9px] tracking-[0.12em] text-ink-2">
          <span>
            <b className="text-accent">A</b> PLAYING
          </span>
          <span>
            CUED <b className="text-accent">B</b>
          </span>
        </p>
        <div className="mt-auto grid gap-1.5">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}

/** A 108 px deck: platter, record, the label in `children`, and an arm that tracks `arm` degrees. */
function Deck({ spin, arm, children }: { spin: number; arm: number; children: ReactNode }) {
  return (
    <div className="relative size-[108px]">
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(#9a9a9a,#e8e8e8,#8d8d8d,#d9d9d9,#9a9a9a)] shadow-[0_8px_16px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.4)]">
        <div
          className="absolute inset-[4px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#121212_0_1px,#1d1d1d_1.4px_2.4px)] shadow-[inset_0_0_0_3px_#0c0c0c] motion-reduce:rotate-0"
          style={{ "--spin": `${spin % 360}deg` } as CSSProperties}
        >
          <div className="absolute top-1/2 left-1/2 size-[38px] -translate-1/2 overflow-hidden rounded-full">
            {children}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-[4px] rounded-full bg-[conic-gradient(from_25deg,transparent_0_6%,rgb(255_255_255/0.13)_11%,transparent_17%_52%,rgb(255_255_255/0.1)_58%,transparent_64%)] [mask:radial-gradient(circle,transparent_37%,#000_38%)]" />
      </div>
      <div
        className="absolute top-[5px] left-[103px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
        style={{ "--arm": `${arm}deg` } as CSSProperties}
        aria-hidden
      >
        <span className="absolute -top-[9px] -left-[9px] size-[18px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#f2f2f2,#9c9c9c_60%,#6d6d6d)] shadow-[0_3px_6px_rgb(0_0_0/0.4)]" />
        <svg
          width="30"
          height="96"
          viewBox="0 0 30 96"
          className="absolute -top-[10px] -left-[15px] overflow-visible drop-shadow-[0_3px_3px_rgb(0_0_0/0.4)]"
        >
          <path
            d="M15 10 L15 80 L11 90"
            fill="none"
            stroke="#e6e6e6"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="4"
            y="86"
            width="9"
            height="7"
            rx="1.5"
            fill="#2b2b2b"
            transform="rotate(22 8 90)"
          />
        </svg>
      </div>
    </div>
  )
}

/** A rotary knob turned `turn` degrees from noon. */
function Knob({ turn }: { turn: number }) {
  return (
    <span
      className="relative size-3.5 rotate-(--turn) rounded-full bg-[radial-gradient(circle_at_40%_35%,#f2f2f2,#8d8d8d)] shadow-[0_1px_2px_rgb(0_0_0/0.6)] after:absolute after:top-0.5 after:left-1/2 after:h-1.5 after:w-px after:-translate-x-1/2 after:bg-black/70"
      style={{ "--turn": `${turn}deg` } as CSSProperties}
    />
  )
}
