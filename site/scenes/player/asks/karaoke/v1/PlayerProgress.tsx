import { clock, lyricAt, TRACK, usePosition, useSeek } from "./data"

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const lyric = lyricAt(at)
  const words = lyric.line.split(" ")
  const sung = Math.floor(lyric.progress * words.length + 0.35)
  return (
    <div data-part="progress" className="grid gap-1.5">
      <p
        data-role="lyric"
        className="line-clamp-2 min-h-[2lh] font-display text-[13px]/[1.3] font-semibold text-ink-2"
        aria-live="off"
      >
        {words.map((word, index) => (
          <span
            key={`${lyric.line}-${index}`}
            className={`transition-colors duration-200 ${index < sung ? "text-accent" : ""}`}
          >
            {word}{" "}
          </span>
        ))}
      </p>
      <div className="flex items-center gap-2 font-num text-[10px] text-ink-2 tabular-nums">
        <span data-role="time">{clock(at)}</span>
        <div
          {...seek}
          data-role="track"
          className="relative h-3 flex-1 cursor-pointer touch-none outline-offset-2"
        >
          <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-rule" />
          <span
            data-role="fill"
            className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full bg-accent"
            style={{ width: `${(at / TRACK.duration) * 100}%` }}
          />
        </div>
        <span data-role="remain">{clock(TRACK.duration)}</span>
      </div>
    </div>
  )
}
