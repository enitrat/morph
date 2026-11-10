import { FLIGHT, SEATS, useSeat } from "./data"

export function PassSeat() {
  const [seat, setSeat] = useSeat()
  const fields = [
    { field: "boarding", label: "Boarding", value: FLIGHT.boarding },
    { field: "gate", label: "Gate", value: FLIGHT.gate },
    { field: "seat", label: "Seat", value: seat.id },
    { field: "group", label: "Group", value: seat.group },
  ]
  return (
    <section data-part="seat" className="grid gap-2.5">
      <dl className="grid grid-cols-4 gap-2">
        {fields.map((entry) => (
          <div key={entry.field} data-role="field" data-field={entry.field}>
            <dt
              data-role="label"
              className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
            >
              {entry.label}
            </dt>
            <dd
              data-role="value"
              className="mt-1 font-num text-[17px]/none font-bold tracking-[-0.01em] tabular-nums"
            >
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      <div data-role="seats" role="group" aria-label="Seat" className="flex gap-1">
        {SEATS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-role="seat-option"
            aria-pressed={seat.id === option.id}
            onClick={() => {
              setSeat(option.id)
            }}
            className="flex-1 rounded-[6px] border border-rule py-1 text-[10.5px] text-ink-2 transition-colors aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
          >
            <b className="font-semibold">{option.id}</b> <span data-role="kind">{option.kind}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
