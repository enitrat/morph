import { FLIGHT, PLANE } from "./data"

export function PassRoute() {
  return (
    <div data-part="route" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <p data-role="from" className="grid">
        <span
          data-role="code"
          className="font-display text-[30px]/[0.9] font-extrabold tracking-[-0.04em]"
        >
          {FLIGHT.from.code}
        </span>
        <span data-role="city" className="mt-1 text-[11px] text-ink-2">
          {FLIGHT.from.city}
        </span>
        <span data-role="time" className="font-num text-[12px] font-semibold tabular-nums">
          {FLIGHT.from.time}
        </span>
      </p>
      <div data-role="path" className="relative size-[84px] text-accent">
        <svg
          viewBox="0 0 84 84"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <g fill="none" stroke="var(--color-rule)" strokeWidth="1">
            <circle cx="42" cy="42" r="38" />
            <ellipse cx="42" cy="42" rx="14" ry="38" />
            <ellipse cx="42" cy="42" rx="28" ry="38" />
            <ellipse cx="42" cy="42" rx="38" ry="13" />
            <path d="M4 42h76" />
          </g>
          <path
            d="M24 58 Q38 14 64 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <circle cx="24" cy="58" r="3" fill="currentColor" />
          <circle
            cx="64"
            cy="26"
            r="3"
            fill="var(--color-paper)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <svg
          data-role="plane"
          viewBox="0 0 24 24"
          className="absolute top-[30px] left-[40px] size-[15px] -translate-1/2 -rotate-[38deg] fill-current"
          aria-hidden
        >
          <path d={PLANE} />
        </svg>
        <span
          data-role="duration"
          className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[10px] whitespace-nowrap text-ink-2"
        >
          {FLIGHT.duration}
        </span>
      </div>
      <p data-role="to" className="grid text-right">
        <span
          data-role="code"
          className="font-display text-[30px]/[0.9] font-extrabold tracking-[-0.04em]"
        >
          {FLIGHT.to.code}
        </span>
        <span data-role="city" className="mt-1 text-[11px] text-ink-2">
          {FLIGHT.to.city}
        </span>
        <span data-role="time" className="font-num text-[12px] font-semibold tabular-nums">
          {FLIGHT.to.time}
        </span>
      </p>
    </div>
  )
}
