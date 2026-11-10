import { clock, PEAKS, TRACK, usePosition, useSeek } from "./data"

/** Every other peak, so the dots breathe. */
const DOTS = PEAKS.filter((_, at) => at % 2 === 0)
const STEP = 12

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1.5">
      <div {...seek} data-role="track" className="h-5 cursor-pointer touch-none outline-offset-4">
        <svg
          viewBox={`0 0 ${DOTS.length * STEP} 20`}
          preserveAspectRatio="xMidYMid meet"
          className="block size-full overflow-visible"
          aria-hidden
        >
          <line
            x1={STEP / 2}
            x2={STEP / 2 + (DOTS.length - 1) * STEP * played}
            y1="10"
            y2="10"
            className="stroke-accent"
            strokeWidth="1.5"
          />
          {DOTS.map((peak, dot) => {
            const done = dot / DOTS.length < played
            return (
              <circle
                key={dot}
                data-role={done ? "fill" : undefined}
                cx={dot * STEP + STEP / 2}
                cy="10"
                r={1.6 + peak * 3.6}
                className={done ? "fill-accent" : "fill-ink-2 opacity-35"}
              />
            )
          })}
        </svg>
      </div>
      <p className="flex justify-between font-num text-[11px] text-ink-2 tabular-nums">
        <span data-role="time">{clock(at)}</span>
        <span data-role="remain">-{clock(TRACK.duration - at)}</span>
      </p>
    </div>
  )
}
