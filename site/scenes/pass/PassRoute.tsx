import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <div data-part="route" className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
      <p data-role="from" className="grid">
        <span
          data-role="code"
          className="font-display text-[44px]/[0.9] font-extrabold tracking-[-0.04em]"
        >
          {FLIGHT.from.code}
        </span>
        <span data-role="city" className="mt-1.5 text-[11px] text-ink-2">
          {FLIGHT.from.city}
        </span>
        <span data-role="time" className="font-num text-[13px] font-semibold tabular-nums">
          {FLIGHT.from.time}
        </span>
      </p>
      <div data-role="path" className="relative mt-3.5 grid h-5 place-items-center text-accent">
        <span className="absolute inset-x-0 top-1/2 border-t-[1.5px] border-dashed border-rule" />
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="relative box-content size-[18px] bg-paper px-1 fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span
          data-role="duration"
          className="absolute top-full mt-1 text-[10px] whitespace-nowrap text-ink-2"
        >
          {FLIGHT.duration}
        </span>
      </div>
      <p data-role="to" className="grid text-right">
        <span
          data-role="code"
          className="font-display text-[44px]/[0.9] font-extrabold tracking-[-0.04em]"
        >
          {FLIGHT.to.code}
        </span>
        <span data-role="city" className="mt-1.5 text-[11px] text-ink-2">
          {FLIGHT.to.city}
        </span>
        <span data-role="time" className="font-num text-[13px] font-semibold tabular-nums">
          {FLIGHT.to.time}
        </span>
      </p>
    </div>
  )
}
