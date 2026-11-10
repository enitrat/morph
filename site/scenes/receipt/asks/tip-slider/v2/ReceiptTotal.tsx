import type { CSSProperties } from "react"
import { MAX_TIP, money, SUBTOTAL, TIPS, tipOf, totalOf, useTip } from "./data"

/** Where the 18 px thumb's centre sits along the track at a tip, for the fill, the bubble and the ticks. */
const at = (tip: number) => `calc(9px + ${tip / MAX_TIP} * (100% - 18px))`

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
      <div
        data-role="tips"
        role="group"
        aria-label="Tip"
        style={{ "--fill": at(tip) } as CSSProperties}
        className="relative mt-8 mb-6"
      >
        <output
          aria-hidden
          style={{ left: at(tip) }}
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-[4px] bg-ink px-1.5 py-[3px] font-num text-[11px]/none font-bold text-paper tabular-nums after:absolute after:top-full after:left-1/2 after:-ml-[4px] after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-ink"
        >
          {tip}%
        </output>
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
          className="relative z-10 block h-[18px] w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-thumb]:shadow-[inset_0_0_0_5px_var(--color-ink),inset_0_0_0_9px_var(--color-paper)] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[inset_0_0_0_5px_var(--color-ink),inset_0_0_0_9px_var(--color-paper)]"
        />
        {TIPS.map((percent) => (
          <button
            key={percent}
            type="button"
            data-role="tip"
            aria-pressed={tip === percent}
            onClick={() => {
              setTip(percent)
            }}
            style={{ left: at(percent) }}
            className="group absolute top-full grid -translate-x-1/2 justify-items-center gap-0.5 px-1 pt-1 font-num text-[10px] text-ink-2 tabular-nums transition-colors hover:text-ink aria-pressed:font-bold aria-pressed:text-ink"
          >
            <span aria-hidden className="h-[5px] w-px bg-current" />
            {percent}%
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
    </section>
  )
}
