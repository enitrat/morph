import type { ReactNode } from "react"

import { clock, TRACK, usePlayback, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

export function Player() {
  const at = usePosition()
  const { playing } = usePlayback()
  return (
    <article
      data-object="player"
      data-layout="terminal"
      className="h-[440px] w-[300px] rotate-[0.8deg] [--color-accent:#1a1a1a] [--color-ink-2:#6d685c] [--color-ink:#1a1a1a] [--color-on-accent:#f3efe4] [--color-paper:#f3efe4] [--color-rule:#cfc8b6] [--font-body:var(--font-mono)] [--font-display:var(--font-mono)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="flex h-full flex-col bg-paper px-4 pt-3 pb-3 font-body text-[10.5px]/[1.55] text-ink shadow-[0_30px_50px_-22px_rgb(0_0_0/0.85),0_1px_3px_rgb(0_0_0/0.3)] [&_[data-role=key]]:rounded-none [&_[data-role=play]]:rounded-none [&_[data-role=play]]:shadow-none [&_[data-role=toggle]]:rounded-none"
      >
        <p data-role="meta" className="flex justify-between text-[9.5px] text-ink-2">
          <span>NOW-PLAYING(1)</span>
          <span>User Commands</span>
          <span>NOW-PLAYING(1)</span>
        </p>
        <Section name="NAME">
          <h3 data-role="heading" className="inline font-display font-bold">
            {TRACK.title}
          </h3>{" "}
          — a song by {TRACK.artist}
        </Section>
        <Section name="SYNOPSIS">
          <b>now-playing</b> [<u>--loop</u>] [<u>--track</u> 0{TRACK.number}]
        </Section>
        <div className="mt-2 flex gap-3">
          <figure className="shrink-0">
            <div className="size-[82px] overflow-hidden shadow-[0_0_0_1px_var(--color-ink)] [&_[data-role=art]]:[filter:grayscale(1)_contrast(1.15)]">
              <PlayerCover />
            </div>
            <figcaption data-role="meta" className="mt-1 text-[9px] text-ink-2">
              Figure 1. Sleeve.
            </figcaption>
          </figure>
          <div className="min-w-0">
            <p className="font-bold">STATUS</p>
            <p className="pl-3">
              {playing ? "Playing" : "Paused"} at {clock(at)} of {clock(TRACK.duration)}.
            </p>
            <p className="mt-1.5 font-bold">FROM</p>
            <p className="pl-3">
              <i>{TRACK.album}</i> ({TRACK.year}), track {TRACK.number} of {TRACK.of}.
            </p>
          </div>
        </div>
        <p className="mt-2.5 font-bold">OPTIONS</p>
        <div className="mt-1 grid gap-2 pl-3">
          <PlayerProgress />
          <PlayerControls />
        </div>
        <p data-role="meta" className="mt-auto flex justify-between pt-2 text-[9.5px] text-ink-2">
          <span>Halden Vale</span>
          <span>November {TRACK.year}</span>
          <span>1</span>
        </p>
      </div>
    </article>
  )
}

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="mt-2.5">
      <p className="font-bold">{name}</p>
      <div className="pl-3">{children}</div>
    </section>
  )
}
