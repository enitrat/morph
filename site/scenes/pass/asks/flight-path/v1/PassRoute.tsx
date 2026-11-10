import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <div data-part="route" className="grid">
      <div data-role="path" className="relative h-[46px] text-accent">
        <svg
          viewBox="0 0 200 46"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <path
            d="M5 42 Q100 -18 195 42"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="absolute bottom-[1px] left-[2.5%] size-[7px] -translate-x-1/2 rounded-full bg-current" />
        <span className="absolute right-[2.5%] bottom-[1px] size-[7px] translate-x-1/2 rounded-full border-[1.5px] border-current bg-paper" />
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="absolute top-[12px] left-1/2 box-content size-[18px] -translate-x-1/2 -translate-y-1/2 bg-paper px-1 fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span
          data-role="duration"
          className="absolute top-[26px] left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap text-ink-2"
        >
          {FLIGHT.duration} · nonstop
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
