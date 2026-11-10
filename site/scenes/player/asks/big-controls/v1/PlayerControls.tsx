import { GLYPH, SKIP, TRACK, usePlayback, usePosition } from "./data"

/** The ring around play, in its own 64 px box. */
const RING = 2 * Math.PI * 30

export function PlayerControls() {
  const player = usePlayback()
  const played = usePosition() / TRACK.duration
  return (
    <div data-part="controls" className="flex items-center justify-between">
      <button
        type="button"
        data-role="toggle"
        aria-label="Like"
        aria-pressed={player.liked}
        onClick={player.toggleLike}
        className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink aria-pressed:text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path
            d={GLYPH.heart}
            fill={player.liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-role="key"
          aria-label="Back to the start"
          onClick={player.restart}
          className="grid size-11 place-items-center rounded-full bg-ink/8 text-ink transition-colors hover:bg-ink/14"
        >
          <svg viewBox="0 0 24 24" className="size-[22px] fill-current" aria-hidden>
            <path d={GLYPH.restart} />
          </svg>
        </button>
        <span className="relative grid size-16 place-items-center">
          <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="none" className="stroke-rule" strokeWidth="2" />
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              className="stroke-accent"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - played)}
            />
          </svg>
          <button
            type="button"
            data-role="play"
            aria-label={player.playing ? "Pause" : "Play"}
            aria-pressed={player.playing}
            onClick={player.toggle}
            className="grid size-[52px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)] transition-transform active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-7 fill-current" aria-hidden>
              <path d={player.playing ? GLYPH.pause : GLYPH.play} />
            </svg>
          </button>
        </span>
        <button
          type="button"
          data-role="key"
          aria-label={`Skip ${SKIP} seconds`}
          onClick={player.skip}
          className="grid size-11 place-items-center rounded-full bg-ink/8 text-ink transition-colors hover:bg-ink/14"
        >
          <svg viewBox="0 0 24 24" className="size-[22px] fill-current" aria-hidden>
            <path d={GLYPH.skip} />
          </svg>
        </button>
      </div>
      <button
        type="button"
        data-role="toggle"
        aria-label="Loop"
        aria-pressed={player.loop}
        onClick={player.toggleLoop}
        className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink aria-pressed:text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
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
