import { TRACK, usePlayback, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

export function Player() {
  return (
    <article
      data-object="player"
      data-layout="card"
      className="h-[440px] w-[300px] rotate-[0.8deg] [--color-accent:#f4efe6] [--color-ink-2:#8d9099] [--color-ink:#f2f1ec] [--color-on-accent:#141519] [--color-paper:#17181c] [--color-rule:#33353c] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="flex h-full flex-col rounded-[26px] border border-white/[0.07] bg-paper p-[18px] font-body text-ink shadow-[0_30px_50px_-24px_rgb(0_0_0/0.85),0_2px_6px_rgb(0_0_0/0.4)]"
      >
        <div className="h-[212px] shrink-0 overflow-hidden rounded-[14px] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.7)]">
          <PlayerCover />
        </div>
        <header className="mt-4 min-w-0">
          <p
            data-role="meta"
            className="flex items-center gap-1.5 font-num text-[10px] tracking-[0.16em] text-ink-2 uppercase"
          >
            <Equaliser />
            Now playing
          </p>
          <h3
            data-role="heading"
            className="mt-1.5 truncate font-display text-[22px]/[1.1] font-bold tracking-[-0.03em]"
          >
            {TRACK.title}
          </h3>
          <p data-role="meta" className="mt-0.5 truncate text-[12.5px] text-ink-2">
            {TRACK.artist} · {TRACK.album}
          </p>
        </header>
        <div className="mt-auto grid gap-2">
          <PlayerProgress />
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}

/** Three bars that dance while the song plays and rest when it stops. */
function Equaliser() {
  const at = usePosition()
  const { playing } = usePlayback()
  return (
    <span className="flex h-2.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((bar) => (
        <i
          key={bar}
          className="w-[2.5px] rounded-[1px] bg-[#7ee0a1]"
          style={{
            height: playing
              ? `${30 + 70 * Math.abs(Math.sin(at * (5 + bar * 1.7) + bar))}%`
              : "30%",
          }}
        />
      ))}
    </span>
  )
}
