import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <div data-part="route" className="grid gap-1.5">
      <div className="flex items-end justify-between gap-2">
        <span
          data-role="time"
          className="font-num text-[28px]/[0.9] font-bold tracking-[-0.03em] tabular-nums"
        >
          {FLIGHT.from.time}
        </span>
        <span
          data-role="time"
          className="font-num text-[28px]/[0.9] font-bold tracking-[-0.03em] tabular-nums"
        >
          {FLIGHT.to.time}
        </span>
      </div>
      <div data-role="path" className="relative flex h-5 items-center text-accent">
        <span className="size-[7px] shrink-0 rounded-full bg-current" />
        <span className="h-[2px] w-[14%] bg-current" />
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="-ml-1 size-4 shrink-0 fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span className="mx-1 flex-1 border-t-2 border-dotted border-rule" />
        <span className="size-[7px] shrink-0 rounded-full border-[1.5px] border-current" />
        <span
          data-role="duration"
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full border border-rule bg-paper px-2 text-[10px]/[16px] whitespace-nowrap text-ink-2"
        >
          {FLIGHT.duration}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <p data-role="from" className="grid">
          <span data-role="code" className="font-display text-[13px] font-bold tracking-[0.02em]">
            {FLIGHT.from.code}
          </span>
          <span data-role="city" className="text-[11px] text-ink-2">
            {FLIGHT.from.city} T{FLIGHT.from.terminal}
          </span>
        </p>
        <p data-role="to" className="grid text-right">
          <span data-role="code" className="font-display text-[13px] font-bold tracking-[0.02em]">
            {FLIGHT.to.code}
          </span>
          <span data-role="city" className="text-[11px] text-ink-2">
            {FLIGHT.to.city} T{FLIGHT.to.terminal}
          </span>
        </p>
      </div>
    </div>
  )
}
