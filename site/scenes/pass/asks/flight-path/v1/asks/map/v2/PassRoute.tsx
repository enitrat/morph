import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <div data-part="route" className="grid">
      <div
        data-role="path"
        className="relative h-[58px] border-y border-rule text-accent [background-image:linear-gradient(90deg,var(--color-rule)_1px,transparent_1px),linear-gradient(var(--color-rule)_1px,transparent_1px)] [background-size:16.66%_100%,100%_50%]"
      >
        <svg
          viewBox="0 0 200 58"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <path
            d="M8 48 C60 8 140 2 192 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute top-[48px] left-[4%] size-[7px] -translate-1/2 rotate-45 bg-current" />
        <span className="absolute top-[14px] left-[96%] size-[7px] -translate-1/2 rotate-45 bg-current" />
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="absolute top-[19px] left-[46%] size-4 -translate-1/2 -rotate-[12deg] fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span
          data-role="duration"
          className="absolute right-1 bottom-0.5 font-num text-[9px] tracking-[0.06em] text-ink-2 uppercase tabular-nums"
        >
          {FLIGHT.duration} · 2,480 km · 46°
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p data-role="from" className="grid">
          <span
            data-role="code"
            className="font-display text-[30px]/[0.9] font-extrabold tracking-[-0.04em]"
          >
            {FLIGHT.from.code}
          </span>
          <span data-role="city" className="mt-1 font-num text-[10px] text-ink-2 tabular-nums">
            38.7° N 9.1° W · <span data-role="time">{FLIGHT.from.time}</span>
          </span>
        </p>
        <p data-role="to" className="grid text-right">
          <span
            data-role="code"
            className="font-display text-[30px]/[0.9] font-extrabold tracking-[-0.04em]"
          >
            {FLIGHT.to.code}
          </span>
          <span data-role="city" className="mt-1 font-num text-[10px] text-ink-2 tabular-nums">
            <span data-role="time">{FLIGHT.to.time}</span> · 55.6° N 12.6° E
          </span>
        </p>
      </div>
    </div>
  )
}
