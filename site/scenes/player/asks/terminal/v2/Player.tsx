import type { ReactNode } from "react"

import { NEXT_TRACK, TRACK, usePlayback } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

const QUEUE = [
  { number: TRACK.number, title: TRACK.title },
  { number: 5, title: NEXT_TRACK.title },
  { number: 6, title: "Weather Kept" },
  { number: 7, title: "Glass Harbour" },
] as const

export function Player() {
  const { playing, loop } = usePlayback()
  return (
    <article
      data-object="player"
      data-layout="terminal"
      className="h-[440px] w-[300px] -rotate-[0.5deg] [--color-accent:#ffd35c] [--color-ink-2:#7f8fc4] [--color-ink:#dfe6ff] [--color-on-accent:#0d1530] [--color-paper:#0d1530] [--color-rule:#33407a] [--font-body:var(--font-mono)] [--font-display:var(--font-mono)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="flex h-full flex-col gap-3 rounded-[8px] bg-paper p-2 pt-3.5 font-body text-[11px]/[1.55] text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),0_30px_50px_-22px_rgb(0_0_0/0.9)] [&_[data-role=key]]:rounded-[2px] [&_[data-role=play]]:rounded-[2px] [&_[data-role=toggle]]:rounded-[2px]"
      >
        <Pane title="now-playing" side={playing ? "▶ live" : "❚❚ paused"}>
          <h3
            data-role="heading"
            className="truncate font-display text-[15px]/[1.3] font-semibold text-accent"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="truncate text-ink-2">
            {TRACK.artist} — {TRACK.album}
          </p>
        </Pane>
        <div className="flex gap-2.5">
          <Pane title="art">
            <div className="size-[104px] overflow-hidden">
              <PlayerCover />
            </div>
          </Pane>
          <Pane title="queue" grow>
            <ol className="grid">
              {QUEUE.map((track, at) => (
                <li
                  key={track.number}
                  className={`flex gap-2 truncate ${at === 0 ? "bg-ink text-paper" : "text-ink-2"} px-1`}
                >
                  <span>{String(track.number).padStart(2, "0")}</span>
                  <span className="truncate">{track.title}</span>
                </li>
              ))}
            </ol>
          </Pane>
        </div>
        <Pane title="keys" side={loop ? "loop on" : "loop off"}>
          <PlayerControls />
        </Pane>
        <div className="mt-auto rounded-[2px] bg-ink/8 px-2.5 pt-2 pb-1.5 shadow-[inset_0_0_0_1px_var(--color-rule)]">
          <PlayerProgress />
          <p data-role="meta" className="mt-1 flex justify-between text-[9.5px] text-ink-2">
            <span>NORMAL · flac 44.1k</span>
            <span>
              {TRACK.number}/{TRACK.of}
            </span>
          </p>
        </div>
      </div>
    </article>
  )
}

/** A box drawn in rule colour with its name set into the top border. */
function Pane({
  title,
  side,
  grow,
  children,
}: {
  title: string
  side?: string
  grow?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`relative min-w-0 rounded-[2px] border border-rule px-2.5 pt-2.5 pb-2 ${grow ? "flex-1" : ""}`}
    >
      <p className="absolute -top-[8px] right-2 left-2 flex justify-between text-[9.5px]/[14px]">
        <span className="bg-paper px-1 text-ink-2">┤ {title} ├</span>
        {side && <span className="bg-paper px-1 text-accent">{side}</span>}
      </p>
      {children}
    </section>
  )
}
