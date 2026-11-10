import { money, SUBTOTAL, TIPS, tipOf, totalOf, useTip } from "./data"

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  return (
    <section data-part="total" className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 text-[11px] text-ink-2">
        <p data-role="row" className="flex justify-between gap-2">
          <span data-role="label">Subtotal</span>
          <span className="font-num tabular-nums">{money(SUBTOTAL)}</span>
        </p>
        <p data-role="row" className="font-num tabular-nums">
          +{money(tipOf(tip))}
        </p>
      </div>
      <div data-role="tips" role="group" aria-label="Tip" className="flex gap-1">
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
      <p
        data-role="grand"
        className="flex items-end justify-between gap-3 rounded-[6px] bg-ink px-3.5 pt-3 pb-2.5 text-paper"
      >
        <span data-role="label" className="pb-1 text-[10.5px] leading-[1.3] tracking-[0.12em]">
          Total
          <br />
          EUR, tip {tip}%
        </span>
        <span
          data-role="amount"
          className="font-num text-[36px]/[1] font-bold tracking-[-0.04em] tabular-nums"
        >
          {money(totalOf(tip))}
        </span>
      </p>
    </section>
  )
}
