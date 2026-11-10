import { clock, GLYPH, SKIP, usePlayback, usePosition } from "./data"

export function PlayerControls() {
  const player = usePlayback()
  const at = usePosition()
  return (
    <div data-part="controls" className="flex h-[52px] gap-1.5">
      <button
        type="button"
        data-role="key"
        aria-label="Back to the start"
        onClick={player.restart}
        className="grid w-[52px] place-items-center rounded-[6px] border border-rule text-ink transition-colors hover:bg-ink/8"
      >
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
          <path d={GLYPH.restart} />
        </svg>
      </button>
      <button
        type="button"
        data-role="play"
        aria-label={player.playing ? "Pause" : "Play"}
        aria-pressed={player.playing}
        onClick={player.toggle}
        className="flex flex-1 items-center justify-between rounded-[6px] bg-accent px-4 text-on-accent transition-transform active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d={player.playing ? GLYPH.pause : GLYPH.play} />
          </svg>
          {player.playing ? "Pause" : "Play"}
        </span>
        <span className="font-num text-[12px] tabular-nums opacity-75">{clock(at)}</span>
      </button>
      <button
        type="button"
        data-role="key"
        aria-label={`Skip ${SKIP} seconds`}
        onClick={player.skip}
        className="grid w-[52px] place-items-center rounded-[6px] border border-rule text-ink transition-colors hover:bg-ink/8"
      >
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
          <path d={GLYPH.skip} />
        </svg>
      </button>
    </div>
  )
}
