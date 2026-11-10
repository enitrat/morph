import { clock, PEAKS, TRACK, usePosition, useSeek } from "./data"

const BAR = 10
const HEIGHT = 40

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1">
      <div {...seek} data-role="track" className="h-10 cursor-pointer touch-none outline-offset-4">
        <svg
          viewBox={`0 0 ${PEAKS.length * BAR} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block size-full"
          aria-hidden
        >
          {PEAKS.map((peak, bar) => {
            const height = Math.max(3, peak * HEIGHT)
            return (
              <rect
                key={bar}
                data-role={bar / PEAKS.length < played ? "fill" : undefined}
                x={bar * BAR + 2}
                y={HEIGHT - height}
                width={BAR - 4}
                height={height}
                rx={2}
                className={bar / PEAKS.length < played ? "fill-accent" : "fill-ink-2 opacity-35"}
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
