import type { CSSProperties } from "react"
import { MAX_TIP, money, SUBTOTAL, TIPS, tipOf, totalOf, useTip } from "./data"

/** Where the 16 px thumb's centre sits along the track, so the filled part ends under it. */
const fillAt = (tip: number) => `calc(8px + ${tip / MAX_TIP} * (100% - 16px))`

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  return (
    <section data-part="total" className="grid gap-0.5">
      <p data-role="row" className="flex justify-between">
        <span data-role="label">Subtotal</span>
        <span className="font-num tabular-nums">{money(SUBTOTAL)}</span>
      </p>
      <p data-role="row" className="mt-1 flex items-baseline justify-between">
        <span className="flex items-baseline gap-1.5">
          <span data-role="label">Tip</span>
          <span className="font-num text-[19px]/none font-bold tracking-[-0.03em] tabular-nums">
            {tip}%
          </span>
        </span>
        <span className="font-num tabular-nums">{money(tipOf(tip))}</span>
      </p>
      <div data-role="tips" role="group" aria-label="Tip" className="mt-2 mb-1 grid gap-1.5">
        <input
          type="range"
          min={0}
          max={MAX_TIP}
          step={1}
          value={tip}
          aria-label="Tip percent"
          aria-valuetext={`${tip} percent`}
          onChange={(event) => {
            setTip(event.currentTarget.valueAsNumber)
          }}
          style={{ "--fill": fillAt(tip) } as CSSProperties}
          className="h-4 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-paper [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-paper [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--color-paper)] [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110"
        />
        <div className="flex items-center justify-between">
          <div className="-ml-1.5 flex gap-0.5">
            {TIPS.map((percent) => (
              <button
                key={percent}
                type="button"
                data-role="tip"
                aria-pressed={tip === percent}
                onClick={() => {
                  setTip(percent)
                }}
                className="rounded-full px-1.5 py-px font-num text-[10px] text-ink-2 tabular-nums transition-colors hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper"
              >
                {percent === 0 ? "None" : percent}
              </button>
            ))}
          </div>
          <span aria-hidden className="font-num text-[9.5px] text-ink-2">
            max {MAX_TIP}%
          </span>
        </div>
      </div>
      <hr data-role="rule" className="my-1.5 border-0 border-t border-dashed border-rule" />
      <p data-role="grand" className="flex items-baseline justify-between text-[15px] font-bold">
        <span data-role="label">Total EUR</span>
        <span data-role="amount" className="font-num tabular-nums">
          {money(totalOf(tip))}
        </span>
      </p>
    </section>
  )
}
