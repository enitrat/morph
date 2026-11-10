import { FLIGHT, PLANE } from "./data"

/** An abstract dot-matrix coast: each dot's column, row and whether it reads as land. */
const DOTS = Array.from({ length: 11 * 40 }, (_, at) => {
  const x = at % 40
  const y = Math.floor(at / 40)
  const land =
    Math.sin(x * 0.31 + 1.2) * 1.6 + Math.cos(y * 0.9 - x * 0.12) * 1.1 + (x > 26 ? -0.5 : 0.4)
  return { x, y, land: land > 0.55 }
})

export function PassRoute() {
  return (
    <div data-part="route" className="grid">
      <div data-role="path" className="relative h-[62px] overflow-hidden rounded-[6px] text-accent">
        <svg
          viewBox="0 0 200 55"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full fill-current text-ink"
          aria-hidden
        >
          {DOTS.map((dot) => (
            <circle
              key={`${dot.x}-${dot.y}`}
              cx={2.5 + dot.x * 5}
              cy={2.5 + dot.y * 5}
              r={dot.land ? 1.15 : 0.6}
              opacity={dot.land ? 0.42 : 0.12}
            />
          ))}
        </svg>
        <svg
          viewBox="0 0 200 62"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <path
            d="M14 50 Q100 -6 186 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute top-[50px] left-[7%] size-[8px] -translate-1/2 rounded-full bg-current ring-[3px] ring-paper" />
        <span className="absolute top-[26px] left-[93%] size-[8px] -translate-1/2 rounded-full bg-current ring-[3px] ring-paper" />
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="absolute top-[22px] left-[48%] size-[18px] -translate-1/2 -rotate-[14deg] fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span
          data-role="duration"
          className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-paper px-1.5 text-[10px] whitespace-nowrap text-ink-2"
        >
          {FLIGHT.duration} · 2,480 km
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p data-role="from" className="grid">
          <span
            data-role="code"
            className="font-display text-[34px]/[0.9] font-extrabold tracking-[-0.04em]"
          >
            {FLIGHT.from.code}
          </span>
          <span data-role="city" className="mt-1 text-[11px] text-ink-2">
            {FLIGHT.from.city} <span data-role="time">{FLIGHT.from.time}</span>
          </span>
        </p>
        <p data-role="to" className="grid text-right">
          <span
            data-role="code"
            className="font-display text-[34px]/[0.9] font-extrabold tracking-[-0.04em]"
          >
            {FLIGHT.to.code}
          </span>
          <span data-role="city" className="mt-1 text-[11px] text-ink-2">
            <span data-role="time">{FLIGHT.to.time}</span> {FLIGHT.to.city}
          </span>
        </p>
      </div>
    </div>
  )
}
