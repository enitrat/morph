import { TRACK, usePlayback, usePosition } from "./data"
import { PlayerControls } from "./PlayerControls"
import { PlayerCover } from "./PlayerCover"
import { PlayerProgress } from "./PlayerProgress"

/** The ASCII bar's width in characters. */
const BAR = 30

export function Player() {
  const { playing } = usePlayback()
  const played = usePosition() / TRACK.duration
  const filled = Math.round(played * BAR)
  const lines = [
    ["title", TRACK.title],
    ["artist", TRACK.artist],
    ["album", `${TRACK.album} (${TRACK.year})`],
    ["track", `0${TRACK.number}/${TRACK.of} · flac`],
  ] as const
  return (
    <article
      data-object="player"
      data-layout="terminal"
      className="h-[440px] w-[300px] rotate-[0.6deg] [--color-accent:#7dffa0] [--color-ink-2:#3fa865] [--color-ink:#a6ffc0] [--color-on-accent:#06100a] [--color-paper:#07110b] [--color-rule:rgb(125_255_160/0.22)] [--font-body:var(--font-thermal)] [--font-display:var(--font-thermal)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="relative flex h-full flex-col overflow-hidden rounded-[10px] bg-paper font-body text-[11px]/[1.6] text-ink shadow-[inset_0_0_0_1px_rgb(125_255_160/0.16),inset_0_0_60px_rgb(0_0_0/0.8),0_30px_50px_-22px_rgb(0_0_0/0.9)] [text-shadow:0_0_6px_rgb(125_255_160/0.45)] after:pointer-events-none after:absolute after:inset-0 after:bg-[repeating-linear-gradient(180deg,rgb(0_0_0/0.22)_0_1px,transparent_1px_3px)] [&_[data-role=key]]:rounded-[3px] [&_[data-role=play]]:rounded-[3px] [&_[data-role=play]]:shadow-none [&_[data-role=toggle]]:rounded-[3px]"
      >
        <p className="flex items-center gap-1.5 border-b border-rule px-3 py-2 text-[9.5px] text-ink-2">
          <i className="size-2 rounded-full border border-current" />
          <i className="size-2 rounded-full border border-current" />
          <i className="size-2 rounded-full border border-current" />
          <span className="ml-1.5 truncate">~/music — now-playing --watch</span>
          <span className="ml-auto">zsh</span>
        </p>
        <div className="flex flex-1 flex-col px-3.5 pt-3 pb-3.5">
          <p>
            <span className="text-ink-2">$</span> now-playing --watch
          </p>
          <div className="mt-2.5 flex gap-3">
            <div className="relative size-[92px] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--color-rule)] [&_[data-role=art]]:[filter:grayscale(1)_contrast(1.35)_brightness(0.95)]">
              <PlayerCover />
              <span className="absolute inset-0 bg-[#3dff7a] mix-blend-multiply" />
              <span className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgb(0_0_0/0.35)_0_1px,transparent_1px_3px)]" />
            </div>
            <dl className="grid min-w-0 grid-cols-[auto_1fr] content-start gap-x-2.5">
              {lines.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt data-role="meta" className="text-ink-2">
                    {key}
                  </dt>
                  {key === "title" ? (
                    <dd>
                      <h3 data-role="heading" className="truncate font-display font-bold">
                        {value}
                      </h3>
                    </dd>
                  ) : (
                    <dd className="truncate">{value}</dd>
                  )}
                </div>
              ))}
              <dt data-role="meta" className="text-ink-2">
                status
              </dt>
              <dd className={playing ? "text-accent" : ""}>{playing ? "playing" : "paused"}</dd>
            </dl>
          </div>
          <p className="mt-3 whitespace-pre text-ink-2" aria-hidden>
            {playing ? "▶" : "❚"} [<span className="text-ink">{"#".repeat(filled)}</span>
            {"-".repeat(BAR - filled)}] {String(Math.round(played * 100)).padStart(3)}%
          </p>
          <div className="mt-auto grid gap-2.5">
            <PlayerProgress />
            <hr data-role="rule" className="border-0 border-t border-dashed border-rule" />
            <PlayerControls />
          </div>
          <p className="mt-2.5">
            <span className="text-ink-2">$</span>{" "}
            <i className="inline-block h-3 w-[7px] translate-y-0.5 animate-pulse bg-ink" />
          </p>
        </div>
      </div>
    </article>
  )
}
