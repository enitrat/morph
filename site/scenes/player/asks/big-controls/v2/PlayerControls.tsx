import { SKIP, usePlayback } from "./data"

export function PlayerControls() {
  const player = usePlayback()
  return (
    <div
      data-part="controls"
      className="grid grid-cols-[auto_1fr_1.5fr_1fr_auto] items-stretch gap-1.5"
    >
      <button
        type="button"
        data-role="toggle"
        aria-pressed={player.liked}
        onClick={player.toggleLike}
        className="rounded-[10px] whitespace-nowrap border border-rule px-2 text-[11px] font-semibold text-ink-2 transition-colors hover:text-ink aria-pressed:border-accent aria-pressed:text-accent"
      >
        {player.liked ? "♥ Liked" : "♡ Like"}
      </button>
      <button
        type="button"
        data-role="key"
        onClick={player.restart}
        className="rounded-[10px] whitespace-nowrap bg-ink/8 text-[13px] font-semibold text-ink transition-colors hover:bg-ink/14"
      >
        Back
      </button>
      <button
        type="button"
        data-role="play"
        aria-pressed={player.playing}
        onClick={player.toggle}
        className="h-12 rounded-[10px] whitespace-nowrap bg-accent text-[15px] font-bold text-on-accent transition-transform active:scale-[0.97]"
      >
        {player.playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        data-role="key"
        aria-label={`Skip ${SKIP} seconds`}
        onClick={player.skip}
        className="rounded-[10px] whitespace-nowrap bg-ink/8 text-[13px] font-semibold text-ink tabular-nums transition-colors hover:bg-ink/14"
      >
        +{SKIP}s
      </button>
      <button
        type="button"
        data-role="toggle"
        aria-pressed={player.loop}
        onClick={player.toggleLoop}
        className="rounded-[10px] whitespace-nowrap border border-rule px-2 text-[11px] font-semibold text-ink-2 transition-colors hover:text-ink aria-pressed:border-accent aria-pressed:text-accent"
      >
        Loop
      </button>
    </div>
  )
}
