import { money, SUBTOTAL, TIPS, tipOf, totalOf, usePeople, useTip } from "./data"

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
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[5px] border border-rule py-1.5 pr-2.5 pl-2.5">
        <div role="group" aria-label="People" className="flex items-center gap-2">
          <span data-role="label" className="text-[10.5px] text-ink-2">
            Split
          </span>
          <div className="flex items-center rounded-full border border-ink p-px">
            <button
              type="button"
              aria-label="One fewer person"
              disabled={people === 1}
              onClick={() => {
                setPeople(people - 1)
              }}
              className="grid size-6 place-items-center rounded-full text-[15px]/none text-ink transition-colors hover:bg-ink hover:text-paper disabled:text-rule disabled:hover:bg-transparent"
            >
              −
            </button>
            <output className="w-5 text-center font-num text-[13px] font-bold tabular-nums">
              {people}
            </output>
            <button
              type="button"
              aria-label="One more person"
              disabled={people === 6}
              onClick={() => {
                setPeople(people + 1)
              }}
              className="grid size-6 place-items-center rounded-full text-[15px]/none text-ink transition-colors hover:bg-ink hover:text-paper disabled:text-rule disabled:hover:bg-transparent"
            >
              +
            </button>
          </div>
        </div>
        <p className="flex items-baseline gap-1.5">
          <span className="font-num text-[15px] font-bold tabular-nums">
            €{money(totalOf(tip) / people)}
          </span>
          <span data-role="label" className="text-[10.5px] text-ink-2">
            each
          </span>
        </p>
      </div>
    </section>
  )
}
