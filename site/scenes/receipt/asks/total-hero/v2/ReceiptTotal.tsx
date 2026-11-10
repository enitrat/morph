import { money, SUBTOTAL, TIPS, tipOf, totalOf, useTip } from "./data"

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
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
      <div className="grid place-items-center pt-3 pb-1">
        <p
          data-role="grand"
          data-shape="stamp"
          className="grid size-[132px] -rotate-[8deg] place-content-center rounded-full border-[3px] border-double border-accent text-center text-accent shadow-[inset_0_0_0_5px_var(--color-paper),inset_0_0_0_6px_var(--color-accent)]"
        >
          <span data-role="label" className="text-[9.5px] font-bold tracking-[0.22em]">
            Paid · EUR
          </span>
          <span
            data-role="amount"
            className="font-num text-[27px]/[1.05] font-bold tracking-[-0.03em] tabular-nums"
          >
            {money(totalOf(tip))}
          </span>
          <span className="text-[9px] tracking-[0.18em] opacity-70">TABLE 4 · 08:52</span>
        </p>
      </div>
    </section>
  )
}
