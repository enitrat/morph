import { clock, TRACK, usePosition, useSeek } from "./data"

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1.5">
      <div
        {...seek}
        data-role="track"
        className="group/track relative h-4 cursor-pointer touch-none outline-offset-4"
      >
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-rule" />
        <span
          data-role="fill"
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-ink"
          style={{ width: `${played * 100}%` }}
        />
        <span
          data-role="head"
          className="absolute top-1/2 size-3 -translate-1/2 rounded-full bg-ink shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition-transform group-hover/track:scale-125"
          style={{ left: `${played * 100}%` }}
        />
      </div>
      <p className="flex justify-between font-num text-[11px] text-ink-2 tabular-nums">
        <span data-role="time">{clock(at)}</span>
        <span data-role="remain">-{clock(TRACK.duration - at)}</span>
      </p>
    </div>
  )
}
