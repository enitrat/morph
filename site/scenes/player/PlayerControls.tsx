import { GLYPH, SKIP, usePlayback } from "./data"

export function PlayerControls() {
  const player = usePlayback()
  return (
    <div data-part="controls" className="flex items-center justify-between">
      <button
        type="button"
        data-role="toggle"
        aria-label="Like"
        aria-pressed={player.liked}
        onClick={player.toggleLike}
        className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink aria-pressed:text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" aria-hidden>
          <path
            d={GLYPH.heart}
            fill={player.liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        data-role="key"
        aria-label="Back to the start"
        onClick={player.restart}
        className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/8"
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
        className="grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)] transition-transform active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
          <path d={player.playing ? GLYPH.pause : GLYPH.play} />
        </svg>
      </button>
      <button
        type="button"
        data-role="key"
        aria-label={`Skip ${SKIP} seconds`}
        onClick={player.skip}
        className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/8"
      >
        <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
          <path d={GLYPH.skip} />
        </svg>
      </button>
      <button
        type="button"
        data-role="toggle"
        aria-label="Loop"
        aria-pressed={player.loop}
        onClick={player.toggleLoop}
        className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink aria-pressed:text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" aria-hidden>
          <path
            d={GLYPH.loop}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
