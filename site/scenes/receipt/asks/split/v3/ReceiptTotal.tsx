import { money, SUBTOTAL, TIPS, tipOf, totalOf, usePeople, useTip } from "./data"

/** Splits an amount into `people` shares that add up to it to the cent: the first guests carry the odd cents. */
const sharesOf = (amount: number, people: number) => {
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / people)
  return Array.from({ length: people }, (_, at) => (base + (at < cents % people ? 1 : 0)) / 100)
}

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  const [people, setPeople] = usePeople()
  const shares = sharesOf(totalOf(tip), people)
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
      <div className="mt-2.5 grid gap-1 rounded-[5px] border border-rule px-2.5 pt-2 pb-1.5">
        <p className="mb-0.5 flex items-baseline justify-between text-[10.5px] text-ink-2">
          <span data-role="label" className="tracking-[0.06em]">
            {people === 1 ? "Not split" : `Split ${people} ways`}
          </span>
          <button
            type="button"
            disabled={people === 6}
            onClick={() => {
              setPeople(people + 1)
            }}
            className="rounded-[3px] px-1 text-ink transition-colors hover:bg-ink hover:text-paper disabled:text-rule disabled:hover:bg-transparent"
          >
            + Guest
          </button>
        </p>
        <ol className="grid gap-px">
          {shares.map((share, at) => (
            <li key={at} data-role="row" className="flex items-center gap-2">
              <span className="grid size-[17px] shrink-0 place-items-center rounded-full bg-ink font-num text-[9.5px] text-paper">
                {at + 1}
              </span>
              <span data-role="label" className="shrink-0">
                Guest {at + 1}
              </span>
              <span
                aria-hidden
                className="h-px min-w-2 flex-1 self-end mb-[5px] border-b border-dotted border-rule"
              />
              <span className="font-num tabular-nums">{money(share)}</span>
              <button
                type="button"
                aria-label={`Remove guest ${at + 1}`}
                disabled={people === 1 || at !== people - 1}
                onClick={() => {
                  setPeople(people - 1)
                }}
                className="grid size-4 shrink-0 place-items-center rounded-full text-[12px]/none text-ink-2 transition-colors hover:bg-ink hover:text-paper disabled:invisible"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
