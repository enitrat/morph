import { clock, lyricAt, TRACK, usePosition, useSeek } from "./data"

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const lyric = lyricAt(at)
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1.5">
      <div className="border-l-2 border-accent pl-2.5">
        <p
          data-role="lyric"
          className="truncate font-display text-[13px]/[1.35] font-semibold text-ink"
        >
          {lyric.line}
        </p>
        <p className="truncate font-display text-[11px]/[1.35] text-ink-2">{lyric.next}</p>
      </div>
      <div className="flex items-center gap-2 font-num text-[10px] text-ink-2 tabular-nums">
        <span data-role="time">{clock(at)}</span>
        <div
          {...seek}
          data-role="track"
          className="relative h-3 flex-1 cursor-pointer touch-none outline-offset-2"
        >
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-rule" />
          <span
            data-role="fill"
            className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-ink"
            style={{ width: `${played * 100}%` }}
          />
          <span
            data-role="head"
            className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-ink"
            style={{ left: `${played * 100}%` }}
          />
        </div>
        <span data-role="remain">-{clock(TRACK.duration - at)}</span>
      </div>
    </div>
  )
}
