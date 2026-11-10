import { clock, PEAKS, TRACK, usePosition, useSeek } from "./data"

const BAR = 10
const HEIGHT = 40

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1">
      <div
        {...seek}
        data-role="track"
        className="relative h-9 cursor-pointer touch-none outline-offset-4"
      >
        <svg
          viewBox={`0 0 ${PEAKS.length * BAR} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block size-full"
          aria-hidden
        >
          {PEAKS.map((peak, bar) => {
            const height = Math.max(2, peak * HEIGHT * 0.94)
            const done = bar / PEAKS.length < played
            return (
              <rect
                key={bar}
                data-role={done ? "fill" : undefined}
                x={bar * BAR + 2.5}
                y={(HEIGHT - height) / 2}
                width={BAR - 5}
                height={height}
                rx={2.5}
                className={done ? "fill-ink" : "fill-ink-2 opacity-30"}
              />
            )
          })}
        </svg>
        <span
          data-role="head"
          className="absolute -inset-y-1 w-[2px] -translate-x-1/2 rounded-full bg-accent"
          style={{ left: `${played * 100}%` }}
        />
      </div>
      <p className="relative h-4 font-num text-[10.5px] text-ink-2 tabular-nums">
        <span
          data-role="time"
          className="absolute top-0 -translate-x-1/2 rounded-[4px] bg-accent px-1.5 text-on-accent"
          style={{ left: `clamp(18px, ${played * 100}%, calc(100% - 64px))` }}
        >
          {clock(at)}
        </span>
        <span data-role="remain" className="absolute top-0 right-0">
          {clock(TRACK.duration)}
        </span>
      </p>
    </div>
  )
}
