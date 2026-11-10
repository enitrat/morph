import type { CSSProperties } from "react"

import { clockFixed, TRACK, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

const MARQUEE = `${TRACK.title} ✦ ${TRACK.artist} ✦ ${TRACK.album} ✦ `.toUpperCase()

export function Player() {
  const at = usePosition()
  return (
    <article
      data-object="player"
      data-layout="y2k"
      className="h-[440px] w-[300px] [--color-accent:#1fb2ff] [--color-ink-2:#4b6596] [--color-ink:#16306a] [--color-on-accent:#ffffff] [--color-paper:#cfe6ff] [--color-rule:rgb(22_48_106/0.16)] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col items-center overflow-hidden rounded-[44px] bg-paper bg-[linear-gradient(170deg,#f4faff,#c4e2ff_38%,#9ccbff_62%,#e3f1ff)] px-5 pt-4 pb-5 font-body text-ink shadow-[inset_0_3px_0_rgb(255_255_255/0.95),inset_0_-8px_20px_rgb(40_80_160/0.3),inset_0_0_0_1.5px_rgb(255_255_255/0.7),0_30px_50px_-22px_rgb(0_0_0/0.85)] [&_[data-role=fill]]:bg-[linear-gradient(90deg,#7ee8ff,#1fb2ff_60%,#7a5cff)] [&_[data-role=head]]:bg-white [&_[data-role=head]]:shadow-[0_0_0_2px_#1fb2ff,0_2px_6px_rgb(0_0_0/0.3)] [&_[data-role=key]]:bg-[linear-gradient(180deg,#d8f3ff,#4cc3ff_50%,#0a8ee0)] [&_[data-role=key]]:text-white [&_[data-role=key]]:shadow-[inset_0_2px_0_rgb(255_255_255/0.8),0_4px_8px_-2px_rgb(10_80_160/0.6)] [&_[data-role=play]]:bg-[linear-gradient(180deg,#ffd6ef,#ff4fb8_52%,#e0288f)] [&_[data-role=play]]:shadow-[inset_0_3px_0_rgb(255_255_255/0.75),0_8px_14px_-4px_rgb(200_30_120/0.6)]"
      >
        <p data-role="meta" className="font-num text-[9px] tracking-[0.3em] text-ink-2">
          ✦ STEREO · DIGITAL ✦
        </p>
        <div className="relative mt-3 size-[168px] shrink-0 rounded-full shadow-[0_0_0_6px_rgb(255_255_255/0.8),0_0_0_7px_rgb(60_80_130/0.25),0_16px_26px_-6px_rgb(30_40_90/0.45)]">
          <div className="size-full overflow-hidden rounded-full">
            <PlayerCover />
          </div>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(ellipse_70%_42%_at_42%_16%,rgb(255_255_255/0.8),transparent_70%)]" />
        </div>
        <div className="mt-5 w-full overflow-hidden rounded-[14px] text-ink [--color-ink-2:#4b6596] [--color-ink:#16306a] bg-[linear-gradient(180deg,#e6fbff,#a9e6ff_60%,#d3f4ff)] px-3 py-2 shadow-[inset_0_2px_5px_rgb(10_60_120/0.35),0_1px_0_rgb(255_255_255/0.9)]">
          <div className="overflow-hidden">
            <h3
              data-role="heading"
              className="flex w-max translate-x-(--scroll) font-num text-[13px]/[1.4] whitespace-pre motion-reduce:translate-x-0"
              style={{ "--scroll": `${-((at * 0.06) % 1) * 50}%` } as CSSProperties}
            >
              <span>{MARQUEE}</span>
              <span aria-hidden>{MARQUEE}</span>
            </h3>
          </div>
          <p className="flex items-baseline justify-between font-num">
            <span data-role="meta" className="text-[9px] text-ink-2">
              TRK 0{TRACK.number} · {clockFixed(TRACK.duration)}
            </span>
            <span className="text-[26px]/none tracking-[0.04em] tabular-nums">
              {clockFixed(at)}
            </span>
          </p>
        </div>
        <div className="mt-auto grid w-full gap-2.5">
          <PlayerProgress />
          <PlayerControls />
        </div>
        <Sparkle className="top-[38px] left-[26px] size-5" />
        <Sparkle className="top-[70px] right-[34px] size-3.5" />
        <Sparkle className="top-[196px] left-[44px] size-3" />
      </div>
    </article>
  )
}

function Sparkle({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`pointer-events-none absolute fill-white ${className}`}
      aria-hidden
    >
      <path d="M10 0C11 7 13 9 20 10C13 11 11 13 10 20C9 13 7 11 0 10C7 9 9 7 10 0Z" />
    </svg>
  )
}
