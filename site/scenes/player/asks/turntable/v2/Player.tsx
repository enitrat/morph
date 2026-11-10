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
      className="h-[440px] w-[300px] rotate-[0.5deg] [--color-accent:#ff6a1f] [--color-ink-2:#6c7078] [--color-ink:#202226] [--color-on-accent:#ffffff] [--color-paper:#e4e5e3] [--color-rule:rgb(0_0_0/0.14)] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col rounded-[14px] bg-paper bg-[linear-gradient(180deg,rgb(255_255_255/0.6),transparent_40%,rgb(0_0_0/0.06)),repeating-linear-gradient(0deg,rgb(0_0_0/0.03)_0_1px,transparent_1px_3px),linear-gradient(90deg,#d9dad8,#eeeeec_40%,#d3d4d2_70%,#e6e7e5)] p-4 font-body text-ink shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12),inset_0_-6px_14px_rgb(0_0_0/0.08),0_30px_50px_-24px_rgb(0_0_0/0.9)]"
      >
        <header className="flex h-[100px] shrink-0 gap-3.5">
          <div className="size-[100px] shrink-0 -rotate-3 overflow-hidden rounded-[2px] shadow-[0_10px_18px_-6px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.08)]">
            <PlayerCover />
          </div>
          <div className="flex min-w-0 flex-col pt-1">
            <p data-role="meta" className="font-num text-[9.5px] tracking-[0.14em] text-ink-2">
              SIDE A · TRACK 0{TRACK.number}
            </p>
            <h3
              data-role="heading"
              className="mt-2 font-display text-[21px]/[1.02] font-extrabold tracking-[-0.03em]"
            >
              {TRACK.title}
            </h3>
            <p data-role="meta" className="mt-auto text-[11.5px]/[1.35] text-ink-2">
              {TRACK.artist}
              <br />
              {TRACK.album}
            </p>
          </div>
        </header>
        <div className="relative mt-2.5 h-[172px] shrink-0">
          <div className="absolute top-[2px] left-0 size-[168px] rounded-full bg-[#2a2b2e] shadow-[0_8px_18px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(255_255_255/0.3)]">
            <div
              className="absolute inset-[5px] rotate-(--spin) rounded-full bg-[repeating-radial-gradient(circle,#141414_0_1.1px,#202020_1.5px_2.6px)] motion-reduce:rotate-0"
              style={{ "--spin": `${(at * RPM) % 360}deg` } as CSSProperties}
            >
              <div className="absolute top-1/2 left-1/2 flex size-[60px] -translate-1/2 flex-col items-center justify-between rounded-full bg-[radial-gradient(circle,#f6f2ea_0_16%,var(--color-accent)_17%)] py-[9px] font-num text-[6.5px]/none font-bold tracking-[0.12em] text-black/70">
                <span>HALDEN VALE</span>
                <span>SIDE A</span>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-[5px] rounded-full bg-[conic-gradient(from_25deg,transparent_0_6%,rgb(255_255_255/0.14)_11%,transparent_17%_52%,rgb(255_255_255/0.1)_58%,transparent_64%)] [mask:radial-gradient(circle,transparent_37%,#000_38%)]" />
          </div>
          <div
            className="absolute top-[16px] left-[226px] size-0 rotate-(--arm) transition-[rotate] duration-500 ease-out"
            style={{ "--arm": `${35 + played * 15}deg` } as CSSProperties}
            aria-hidden
          >
            <span className="absolute -top-[17px] -left-[17px] size-[34px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#ffffff,#b9bab8_60%,#8a8b89)] shadow-[0_4px_10px_rgb(0_0_0/0.3)]" />
            <svg
              width="40"
              height="174"
              viewBox="0 0 40 174"
              className="absolute -top-[14px] -left-[20px] overflow-visible drop-shadow-[0_4px_4px_rgb(0_0_0/0.3)]"
            >
              <circle cx="20" cy="14" r="6" fill="#3a3b3e" />
              <path
                d="M20 14 L20 142 L13 160"
                fill="none"
                stroke="#2a2b2e"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="4"
                y="155"
                width="16"
                height="11"
                rx="2"
                fill="var(--color-accent)"
                transform="rotate(22 12 160)"
              />
            </svg>
          </div>
          <div className="absolute right-0 bottom-0 grid justify-items-end gap-1.5">
            <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
            <p className="font-num text-[9px] tracking-[0.12em] text-ink-2">33 · 45</p>
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
