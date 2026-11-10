import { money, SUBTOTAL, TIPS, tipOf, totalOf, usePeople, useTip } from "./data"

const SEATS = 6
const TABLE = 116
const ORBIT = 44

/** Each seat's centre in the table box, clockwise from the top. */
const SEAT_AT = Array.from({ length: SEATS }, (_, at) => {
  const angle = ((at * 360) / SEATS - 90) * (Math.PI / 180)
  return { left: TABLE / 2 + ORBIT * Math.cos(angle), top: TABLE / 2 + ORBIT * Math.sin(angle) }
})

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  const [people, setPeople] = usePeople()
  return (
    <section data-part="total" className="grid gap-0.5">
      <p data-role="row" className="flex justify-between">
        <span data-role="label">Subtotal</span>
        <span className="font-num tabular-nums">{money(SUBTOTAL)}</span>
      </p>
      <p data-role="row" className="flex justify-between">
        <span data-role="label">Tip {tip}%</span>
        <span className="font-num tabular-nums">{money(tipOf(tip))}</span>
      </p>
      <div data-role="tips" role="group" aria-label="Tip" className="my-1.5 flex gap-1">
        {TIPS.map((percent) => (
          <button
            key={percent}
            type="button"
            data-role="tip"
            aria-pressed={tip === percent}
            onClick={() => {
              setTip(percent)
            }}
            className="flex-1 rounded-[3px] border border-current py-0.5 text-[11px] text-ink-2 transition-colors aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {percent === 0 ? "No tip" : `${percent}%`}
          </button>
        ))}
      </div>
      <hr data-role="rule" className="my-1.5 border-0 border-t border-dashed border-rule" />
      <p data-role="grand" className="flex items-baseline justify-between text-[15px] font-bold">
        <span data-role="label">Total EUR</span>
        <span data-role="amount" className="font-num tabular-nums">
          {money(totalOf(tip))}
        </span>
      </p>
      <div className="mt-2 grid grid-cols-[116px_minmax(0,1fr)] items-center gap-3">
        <div role="group" aria-label="People at the table" className="relative size-[116px]">
          <div className="absolute inset-[30px] grid place-content-center rounded-full border border-rule bg-rule/25 text-center">
            <span className="font-num text-[19px]/none font-bold tabular-nums">{people}</span>
            <span data-role="label" className="mt-0.5 text-[8.5px] tracking-[0.1em] text-ink-2">
              {people === 1 ? "guest" : "guests"}
            </span>
          </div>
          {SEAT_AT.map((at, seat) => (
            <button
              key={seat}
              type="button"
              aria-label={seat === 0 ? "Just me" : `${seat + 1} people`}
              aria-pressed={seat < people}
              onClick={() => {
                setPeople(seat + 1)
              }}
              style={{ left: at.left, top: at.top }}
              className="absolute grid size-[22px] -translate-1/2 place-items-center rounded-full border border-dashed border-rule bg-paper font-num text-[10px] text-ink-2 transition-[background-color,border-color,color,scale] duration-200 hover:scale-110 hover:border-ink-2 aria-pressed:border-solid aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {seat + 1}
            </button>
          ))}
        </div>
        <div className="grid gap-1">
          <span data-role="label" className="text-[10.5px] tracking-[0.06em] text-ink-2">
            Each pays
          </span>
          <span className="font-num text-[24px]/none font-bold tracking-[-0.03em] tabular-nums">
            {money(totalOf(tip) / people)}
          </span>
          <span className="mt-1 text-[10px]/[1.35] text-ink-2">
            Tap a seat to set how many share.
          </span>
        </div>
      </div>
    </section>
  )
}
