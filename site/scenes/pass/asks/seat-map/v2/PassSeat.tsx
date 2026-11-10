import { FLIGHT, isTaken, LETTERS, SEATS, useSeat } from "./data"

const ROWS = Array.from({ length: 12 }, (_, at) => at + 4)

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
      <dl className="grid grid-cols-[1.1fr_0.8fr_1.5fr_0.8fr] gap-2">
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
              {entry.field === "seat" && (
                <span
                  data-role="kind"
                  className="ml-1 text-[9px] font-medium tracking-normal text-ink-2"
                >
                  {seat.kind}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div
        data-role="seats"
        role="group"
        aria-label="Seat"
        className="flex items-stretch rounded-l-[34px] rounded-r-[6px] border border-rule py-1 pr-1.5 pl-6"
      >
        <div className="grid flex-1 grid-flow-col grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-[auto_repeat(3,auto)_4px_repeat(3,auto)] gap-x-[2px] gap-y-[2px]">
          {ROWS.flatMap((row) => [
            <span
              key={`${row}`}
              className="text-center font-num text-[7px]/[8px] text-ink-2 tabular-nums"
            >
              {row % 2 === 0 ? row : ""}
            </span>,
            ...LETTERS.flatMap((letter) => {
              const option = SEATS.find((entry) => entry.row === row && entry.letter === letter)
              const cell =
                option === undefined ? (
                  <span
                    key={`${row}${letter}`}
                    aria-hidden
                    className={`h-[7px] rounded-[2px] ${isTaken(row, letter) ? "bg-ink/20" : "border border-rule"}`}
                  />
                ) : (
                  <button
                    key={`${row}${letter}`}
                    type="button"
                    data-role="seat-option"
                    aria-pressed={seat.id === option.id}
                    aria-label={`Seat ${option.id}, ${option.kind}`}
                    onClick={() => {
                      setSeat(option.id)
                    }}
                    className="relative h-[7px] rounded-[2px] bg-accent/30 transition-colors before:absolute before:-inset-1 aria-pressed:bg-accent aria-pressed:ring-2 aria-pressed:ring-accent/30"
                  />
                )
              return letter === "D" ? [<span key={`${row}aisle`} aria-hidden />, cell] : [cell]
            }),
          ])}
        </div>
      </div>
    </section>
  )
}
