import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <ol data-part="route" className="relative grid gap-1.5 pl-6">
      <li
        data-role="path"
        aria-hidden
        className="absolute top-[9px] bottom-[9px] left-[5px] grid place-items-center border-l-[1.5px] border-dashed border-rule text-accent"
      >
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="-ml-px box-content size-[14px] rotate-90 bg-paper py-1 fill-current"
        >
          <path d={PLANE} />
        </svg>
      </li>
      <li data-role="from" className="relative grid grid-cols-[1fr_auto] items-baseline gap-x-3">
        <span className="absolute top-[5px] -left-6 size-[11px] rounded-full border-[2.5px] border-accent bg-paper" />
        <span className="min-w-0">
          <span
            data-role="code"
            className="font-display text-[24px]/none font-extrabold tracking-[-0.03em]"
          >
            {FLIGHT.from.code}
          </span>{" "}
          <span data-role="city" className="text-[11px] text-ink-2">
            {FLIGHT.from.city} T{FLIGHT.from.terminal}
          </span>
        </span>
        <span data-role="time" className="font-num text-[17px] font-bold tabular-nums">
          {FLIGHT.from.time}
        </span>
      </li>
      <li data-role="duration" className="text-[10.5px] text-ink-2">
        {FLIGHT.duration} nonstop · Copenhagen +1 h
      </li>
      <li data-role="to" className="relative grid grid-cols-[1fr_auto] items-baseline gap-x-3">
        <span className="absolute top-[5px] -left-6 size-[11px] rounded-full bg-accent" />
        <span className="min-w-0">
          <span
            data-role="code"
            className="font-display text-[24px]/none font-extrabold tracking-[-0.03em]"
          >
            {FLIGHT.to.code}
          </span>{" "}
          <span data-role="city" className="text-[11px] text-ink-2">
            {FLIGHT.to.city} T{FLIGHT.to.terminal}
          </span>
        </span>
        <span data-role="time" className="font-num text-[17px] font-bold tabular-nums">
          {FLIGHT.to.time}
        </span>
      </li>
    </ol>
  )
}
