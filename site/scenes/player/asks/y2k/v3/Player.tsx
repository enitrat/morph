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
      data-layout="y2k"
      className="h-[440px] w-[300px] -rotate-[1deg] [--color-accent:#b8ff3d] [--color-ink-2:#9aa3b2] [--color-ink:#e9edf3] [--color-on-accent:#1b2a0d] [--color-paper:#30343d] [--color-rule:rgb(255_255_255/0.14)] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col items-center rounded-[34px] bg-paper bg-[linear-gradient(175deg,#5b6170,#30343d_40%,#4b505c_52%,#22252c)] px-4 pt-4 pb-5 font-body text-ink shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_0_0_1.5px_rgb(0_0_0/0.4),0_30px_50px_-22px_rgb(0_0_0/0.9)]"
      >
        <div className="flex h-[196px] w-full shrink-0 flex-col rounded-[12px] bg-[linear-gradient(180deg,#d7ff8a,#a7e83a)] p-3 text-[#1b2a0d] shadow-[inset_0_2px_6px_rgb(0_0_0/0.35),0_0_0_3px_#16181d,0_1px_0_4px_rgb(255_255_255/0.12)] [--color-accent:#1b2a0d] [--color-ink-2:#3e5a1c] [--color-ink:#1b2a0d] [--color-on-accent:#d7ff8a] [--color-rule:rgb(27_42_13/0.25)]">
          <p className="flex justify-between font-num text-[9px] text-ink-2">
            <span>{playing ? "▶ NOW PLAYING" : "❚❚ PAUSED"}</span>
            <span>
              ▮▮▮▯ 0{TRACK.number}/{TRACK.of}
            </span>
          </p>
          <div className="mt-2 flex gap-3">
            <div className="size-[86px] shrink-0 overflow-hidden rounded-[4px] shadow-[0_0_0_1px_rgb(27_42_13/0.4)]">
              <PlayerCover />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3
                data-role="heading"
                className="font-display text-[19px]/[1.02] font-extrabold tracking-[-0.03em]"
              >
                {TRACK.title}
              </h3>
              <p data-role="meta" className="mt-1.5 text-[11px]/[1.3] text-ink-2">
                {TRACK.artist}
                <br />
                {TRACK.album}
              </p>
            </div>
          </div>
          <div className="mt-auto">
            <PlayerProgress />
          </div>
        </div>
        <div className="relative mt-4 flex h-[96px] w-full items-end justify-between rounded-[16px] bg-[#1d2026] bg-[radial-gradient(#0d0e11_1.7px,transparent_2.2px)] bg-size-[9px_9px] bg-position-[4px_4px] p-2.5 shadow-[inset_0_2px_6px_rgb(0_0_0/0.6),0_1px_0_rgb(255_255_255/0.1)]">
          <span className="rounded-full bg-[linear-gradient(180deg,#5b6170,#3a3e48)] px-2 py-0.5 font-num text-[8.5px] tracking-[0.14em] text-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]">
            HYPER BASS · 2 W
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 font-num text-[9px] text-ink-2 tabular-nums">
            <i
              className={`size-1.5 rounded-full ${playing ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-white/15"}`}
            />
            {clock(at)}
          </span>
        </div>
        <div className="mt-auto w-full rounded-full bg-[#16181d] px-2 py-1.5 [--color-ink-2:#9aa3b2] [--color-ink:#e9edf3] [--color-rule:rgb(255_255_255/0.14)] shadow-[inset_0_2px_6px_rgb(0_0_0/0.7),0_1px_0_rgb(255_255_255/0.12)] [&_[data-role=key]]:bg-[linear-gradient(180deg,#7b8291,#3a3f4a_60%,#2a2e36)] [&_[data-role=key]]:text-accent [&_[data-role=key]]:shadow-[inset_0_2px_0_rgb(255_255_255/0.3),0_3px_6px_rgb(0_0_0/0.5)] [&_[data-role=play]]:bg-[linear-gradient(180deg,#e6ff9e,#a8f02a_55%,#7cc400)] [&_[data-role=play]]:shadow-[inset_0_3px_0_rgb(255_255_255/0.7),0_6px_12px_-4px_rgb(120_200_0/0.6)]">
          <PlayerControls />
        </div>
      </div>
    </article>
  )
}
