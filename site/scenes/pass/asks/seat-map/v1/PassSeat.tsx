import { FLIGHT, isTaken, LETTERS, SEATS, useSeat } from "./data"

const ROWS = [6, 14] as const

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
      <div className="flex items-center justify-between gap-3">
        <div data-role="seats" role="group" aria-label="Seat" className="grid gap-[3px]">
          {ROWS.map((row) => (
            <div key={row} className="flex items-center gap-[3px]">
              <span className="w-3.5 font-num text-[8.5px] text-ink-2 tabular-nums">{row}</span>
              {LETTERS.map((letter) => {
                const option = SEATS.find((entry) => entry.row === row && entry.letter === letter)
                const gap = letter === "C" ? "mr-2" : ""
                return option === undefined ? (
                  <span
                    key={letter}
                    aria-hidden
                    className={`size-[15px] rounded-[4px] ${gap} ${isTaken(row, letter) ? "bg-ink/15" : "border border-rule"}`}
                  />
                ) : (
                  <button
                    key={letter}
                    type="button"
                    data-role="seat-option"
                    aria-pressed={seat.id === option.id}
                    aria-label={`Seat ${option.id}, ${option.kind}`}
                    onClick={() => {
                      setSeat(option.id)
                    }}
                    className={`relative grid size-[15px] place-items-center rounded-[4px] border border-accent text-[8px] font-bold text-accent transition-colors before:absolute before:-inset-[3px] aria-pressed:bg-accent aria-pressed:text-on-accent ${gap}`}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <p className="text-right text-[10px]/[1.35] text-ink-2">
          <span data-role="kind" className="block font-semibold text-ink">
            {seat.kind} seat
          </span>
          Tap a lit seat
        </p>
      </div>
    </section>
  )
}
