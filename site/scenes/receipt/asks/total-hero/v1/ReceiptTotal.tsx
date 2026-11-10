import { money, SUBTOTAL, TIPS, tipOf, totalOf, useTip } from "./data"

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  return (
    <section data-part="total" className="grid gap-1">
      <p data-role="grand" className="grid">
        <span data-role="label" className="text-[10.5px] tracking-[0.14em] text-ink-2">
          Total EUR
        </span>
        <span
          data-role="amount"
          className="font-num text-[46px]/[1] font-bold tracking-[-0.04em] tabular-nums"
        >
          {money(totalOf(tip))}
        </span>
      </p>
      <p data-role="row" className="flex justify-between text-[11px] text-ink-2">
        <span data-role="label">
          Subtotal {money(SUBTOTAL)} + tip {tip}%
        </span>
        <span className="font-num tabular-nums">+{money(tipOf(tip))}</span>
      </p>
      <div data-role="tips" role="group" aria-label="Tip" className="mt-2 flex gap-1">
        {TIPS.map((percent) => (
          <button
            key={percent}
            type="button"
            data-role="tip"
            aria-pressed={tip === percent}
            onClick={() => {
              setTip(percent)
            }}
            className="flex-1 rounded-full border border-rule py-1 text-[11px] text-ink-2 transition-colors aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {percent === 0 ? "No tip" : `${percent}%`}
          </button>
        ))}
      </div>
    </section>
  )
}
