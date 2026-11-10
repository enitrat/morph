import { FLIGHT, SEATS, useSeat } from "./data"

export function PassSeat() {
  const [seat, setSeat] = useSeat()
  return (
    <section data-part="seat" className="grid gap-2.5">
      <dl className="flex gap-5">
        <div data-role="field" data-field="boarding">
          <dt
            data-role="label"
            className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
          >
            Boarding
          </dt>
          <dd
            data-role="value"
            className="mt-1 font-num text-[17px]/none font-bold tracking-[-0.01em] tabular-nums"
          >
            {FLIGHT.boarding}
          </dd>
        </div>
        <div data-role="field" data-field="gate">
          <dt
            data-role="label"
            className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
          >
            Gate
          </dt>
          <dd
            data-role="value"
            className="mt-1 font-num text-[17px]/none font-bold tracking-[-0.01em] tabular-nums"
          >
            {FLIGHT.gate}
          </dd>
        </div>
        <div data-role="field" data-field="seat" className="ml-auto text-right">
          <dt
            data-role="label"
            className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
          >
            Your seat
          </dt>
          <dd
            data-role="value"
            className="mt-1 font-num text-[17px]/none font-bold tracking-[-0.01em] tabular-nums"
          >
            {seat.id}
          </dd>
        </div>
      </dl>
      <div data-role="seats" role="group" aria-label="Seat" className="grid grid-cols-3 gap-1.5">
        {SEATS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-role="seat-option"
            aria-pressed={seat.id === option.id}
            onClick={() => {
              setSeat(option.id)
            }}
            className="grid gap-0.5 rounded-[8px] border border-rule px-2 pt-1.5 pb-1.5 text-left text-ink transition-colors aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
          >
            <b className="font-num text-[18px]/none font-bold tracking-[-0.02em] tabular-nums">
              {option.id}
            </b>
            <span className="text-[10px] whitespace-nowrap">
              <span data-role="kind" className="opacity-80">
                {option.kind}
              </span>{" "}
              <span className="font-semibold opacity-60">G{option.group}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
