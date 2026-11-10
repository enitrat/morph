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
        <div className="flex h-[278px] shrink-0 gap-3">
          <div className="flex flex-col justify-between">
            <Deck spin={at * RPM} arm={6 + played * 20}>
              <PlayerCover />
            </Deck>
            <Deck spin={at * RPM * 0.94 + 120} arm={8}>
              <span className="block size-full bg-[radial-gradient(circle,#f2efe6_0_14%,#1f8bff_15%)]" />
            </Deck>
          </div>
          <div className="flex min-w-0 flex-1 flex-col rounded-[8px] bg-black/30 p-2.5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5),0_1px_0_rgb(255_255_255/0.08)]">
            <p data-role="meta" className="font-num text-[9px] tracking-[0.14em] text-accent">
              A · ON AIR
            </p>
            <h3 data-role="heading" className="mt-1 font-display text-[17px]/[1.05] font-semibold">
              {TRACK.title}
            </h3>
            <p data-role="meta" className="mt-0.5 text-[10.5px] text-ink-2">
              {TRACK.artist}
            </p>
            <div className="my-3 flex flex-1 justify-around">
              <Fader value={1 - played} label="A" live={playing} />
              <Fader value={played} label="B" live={false} />
            </div>
            <p data-role="meta" className="font-num text-[9px] tracking-[0.14em] text-ink-2">
              B · CUED
            </p>
            <p className="mt-1 truncate font-display text-[13px]/[1.1] text-ink-2 italic">
              {NEXT_TRACK.title}
            </p>
          </div>
        </div>
        <div className="mt-auto grid gap-1.5">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}

/** A 134 px deck: platter, record, the label in `children`, and an arm that tracks `arm` degrees. */
function Deck({ spin, arm, children }: { spin: number; arm: number; children: ReactNode }) {
  return (
    <div className="relative size-[134px]">
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(#9a9a9a,#e8e8e8,#8d8d8d,#d9d9d9,#9a9a9a)] shadow-[0_8px_16px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.4)]">
        <div
          className="absolute inset-[5px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#121212_0_1px,#1d1d1d_1.4px_2.4px)] shadow-[inset_0_0_0_3px_#0c0c0c] motion-reduce:rotate-0"
          style={{ "--spin": `${spin % 360}deg` } as CSSProperties}
        >
          <div className="absolute top-1/2 left-1/2 size-[46px] -translate-1/2 overflow-hidden rounded-full">
            {children}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-[5px] rounded-full bg-[conic-gradient(from_25deg,transparent_0_6%,rgb(255_255_255/0.13)_11%,transparent_17%_52%,rgb(255_255_255/0.1)_58%,transparent_64%)] [mask:radial-gradient(circle,transparent_37%,#000_38%)]" />
      </div>
      <div
        className="absolute top-[6px] left-[128px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
        style={{ "--arm": `${arm}deg` } as CSSProperties}
        aria-hidden
      >
        <span className="absolute -top-[11px] -left-[11px] size-[22px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#f2f2f2,#9c9c9c_60%,#6d6d6d)] shadow-[0_3px_6px_rgb(0_0_0/0.4)]" />
        <svg
          width="30"
          height="116"
          viewBox="0 0 30 116"
          className="absolute -top-[10px] -left-[15px] overflow-visible drop-shadow-[0_3px_3px_rgb(0_0_0/0.4)]"
        >
          <path
            d="M15 10 L15 92 L10 104"
            fill="none"
            stroke="#e6e6e6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="3"
            y="100"
            width="11"
            height="8"
            rx="1.5"
            fill="#2b2b2b"
            transform="rotate(22 8 104)"
          />
        </svg>
      </div>
    </div>
  )
}

/** A channel fader: the cap sits at `value`, 0 at the bottom and 1 at the top. */
function Fader({ value, label, live }: { value: number; label: string; live: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={`size-1.5 rounded-full ${live ? "bg-[#9ee37d] shadow-[0_0_6px_#9ee37d]" : "bg-white/15"}`}
      />
      <div className="relative w-1.5 flex-1 rounded-full bg-black/55 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]">
        <span
          className="absolute left-1/2 h-3.5 w-6 -translate-x-1/2 translate-y-1/2 rounded-[3px] bg-[linear-gradient(#f2f2f2,#a9a9a9)] shadow-[0_2px_4px_rgb(0_0_0/0.5)] after:absolute after:inset-x-1 after:top-1/2 after:h-px after:bg-black/60"
          style={{ bottom: `${value * 100}%` }}
        />
      </div>
      <span className="font-num text-[9px] font-bold text-ink-2">{label}</span>
    </div>
  )
}
