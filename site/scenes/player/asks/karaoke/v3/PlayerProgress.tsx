import { lyricAt, SECTIONS, TRACK, usePosition, useSeek } from "./data"

export function PlayerProgress() {
  const at = usePosition()
  const seek = useSeek()
  const lyric = lyricAt(at)
  const words = lyric.line.split(" ")
  const sung = Math.floor(lyric.progress * words.length + 0.35)
  const played = at / TRACK.duration
  return (
    <div data-part="progress" className="grid gap-1.5 text-center">
      <p
        data-role="lyric"
        className="grid h-[2lh] place-items-center overflow-hidden font-display text-[16px]/[1.15] font-bold tracking-[-0.02em] text-balance text-ink-2"
      >
        <span>
          {words.map((word, index) => (
            <span
              key={`${lyric.line}-${index}`}
              className={`transition-colors duration-200 ${index < sung ? "text-ink" : ""}`}
            >
              {word}{" "}
            </span>
          ))}
        </span>
      </p>
      <div
        {...seek}
        data-role="track"
        className="relative h-3 cursor-pointer touch-none outline-offset-2"
      >
        <span className="absolute inset-x-0 top-1/2 h-px bg-rule" />
        {SECTIONS.map((part) => (
          <span
            key={part.name}
            className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${part.at <= at ? "bg-accent" : "bg-ink-2"}`}
            style={{ left: `${(part.at / TRACK.duration) * 100}%` }}
          />
        ))}
        <span
          data-role="fill"
          className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-accent"
          style={{ width: `${played * 100}%` }}
        />
        <span
          data-role="head"
          className="absolute top-1/2 size-2 -translate-1/2 rotate-45 bg-accent"
          style={{ left: `${played * 100}%` }}
        />
      </div>
    </div>
  )
}
