import type { CSSProperties } from "react"

import { clockFixed, TRACK, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

/** A disc spins much faster than a record; slowed down here so it reads as turning, not as blur. */
const SPIN = 90

export function Player() {
  const at = usePosition()
  return (
    <article
      data-object="player"
      data-layout="y2k"
      className="h-[440px] w-[300px] rotate-[1deg] [--color-accent:#ff4fb8] [--color-ink-2:#9a4a8d] [--color-ink:#5a1650] [--color-on-accent:#ffffff] [--color-paper:#ffc4e8] [--color-rule:rgb(90_22_80/0.16)] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col items-center rounded-[150px_150px_40px_40px] bg-paper bg-[linear-gradient(170deg,rgb(255_214_240/0.98),rgb(255_150_215/0.95)_42%,rgb(205_160_255/0.95)_72%,rgb(255_200_235/0.98))] px-5 pt-4 pb-5 font-body text-ink shadow-[inset_0_3px_0_rgb(255_255_255/0.9),inset_0_-8px_20px_rgb(130_40_140/0.35),inset_0_0_0_1.5px_rgb(255_255_255/0.6),0_30px_50px_-22px_rgb(0_0_0/0.85)] [&_[data-role=fill]]:bg-[linear-gradient(90deg,#ffb3e2,#ff4fb8)] [&_[data-role=head]]:bg-white [&_[data-role=head]]:shadow-[0_0_0_2px_#ff4fb8] [&_[data-role=key]]:bg-[linear-gradient(180deg,#f3d2ff,#b36bff_55%,#8a3ee6)] [&_[data-role=key]]:text-white [&_[data-role=key]]:shadow-[inset_0_2px_0_rgb(255_255_255/0.7),0_4px_8px_-2px_rgb(110_40_180/0.55)] [&_[data-role=play]]:bg-[linear-gradient(180deg,#ffd0ec,#ff4fb8_55%,#e0288f)] [&_[data-role=play]]:shadow-[inset_0_3px_0_rgb(255_255_255/0.75),0_8px_14px_-4px_rgb(200_30_120/0.6)]"
      >
        <div className="relative size-[222px] shrink-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,rgb(255_255_255/0.5),rgb(255_120_200/0.35))] shadow-[inset_0_0_0_2px_rgb(255_255_255/0.7),inset_0_6px_18px_rgb(150_40_120/0.35)]">
          <div
            className="absolute inset-[14px] rotate-(--spin) overflow-hidden rounded-full shadow-[0_6px_14px_rgb(120_30_100/0.4)] motion-reduce:rotate-0"
            style={{ "--spin": `${(at * SPIN) % 360}deg` } as CSSProperties}
          >
            <PlayerCover />
            <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_30deg,transparent,rgb(255_255_255/0.35)_8%,transparent_16%,rgb(160_255_240/0.25)_40%,transparent_50%,rgb(255_255_255/0.3)_62%,transparent_72%)] mix-blend-screen" />
            <span className="absolute top-1/2 left-1/2 size-[46px] -translate-1/2 rounded-full bg-[radial-gradient(circle,var(--color-paper)_0_9px,rgb(255_255_255/0.75)_10px_14px,rgb(255_255_255/0.25)_15px)]" />
          </div>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(ellipse_62%_36%_at_40%_18%,rgb(255_255_255/0.85),transparent_70%)]" />
        </div>
        <div className="mt-3 flex w-full items-center justify-between rounded-full text-ink [--color-ink-2:#9a4a8d] [--color-ink:#5a1650] bg-[linear-gradient(180deg,#fff0fb,#ffc2ec_60%,#ffe0f6)] px-4 py-1.5 shadow-[inset_0_2px_5px_rgb(120_20_90/0.3),0_1px_0_rgb(255_255_255/0.9)]">
          <span className="min-w-0">
            <h3 data-role="heading" className="truncate font-num text-[11px]/[1.3]">
              ♪ {TRACK.title.toUpperCase()}
            </h3>
            <p data-role="meta" className="font-num text-[8.5px] text-ink-2">
              TRK 0{TRACK.number}/{TRACK.of} · ANTI-SKIP
            </p>
          </span>
          <span className="font-num text-[20px]/none tabular-nums">{clockFixed(at)}</span>
        </div>
        <div className="mt-auto grid w-full gap-2">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}
