import type { CSSProperties } from "react"
import { MAX_TIP, money, SUBTOTAL, tipOf, totalOf, useTip } from "./data"

/** Where the 6 px bar thumb's centre sits along the track, so the filled part ends under it. */
const fillAt = (tip: number) => `calc(3px + ${tip / MAX_TIP} * (100% - 6px))`
const SCALE = Array.from({ length: Math.floor(MAX_TIP / 5) + 1 }, (_, at) => at * 5)

export function ReceiptTotal() {
  const [tip, setTip] = useTip()
  const nudge = (by: number) => {
    setTip(tip + by)
  }
  return (
    <section data-part="total" className="grid gap-0.5">
      <p data-role="row" className="flex justify-between">
        <span data-role="label">Subtotal</span>
        <span className="font-num tabular-nums">{money(SUBTOTAL)}</span>
      </p>
      <div
        data-role="tips"
        role="group"
        aria-label="Tip"
        className="my-2 grid gap-1 rounded-[6px] border border-rule px-3 pt-2 pb-3"
      >
        <p data-role="row" className="flex justify-between text-[10.5px] text-ink-2">
          <span data-role="label" className="tracking-[0.06em]">
            Tip
          </span>
          <span className="font-num tabular-nums">+{money(tipOf(tip))}</span>
        </p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            data-role="tip"
            aria-label="Lower the tip"
            disabled={tip === 0}
            onClick={() => {
              nudge(-1)
            }}
            className="grid size-8 place-items-center rounded-full border border-ink text-[17px]/none text-ink transition-[background-color,color,scale] hover:bg-ink hover:text-paper active:scale-95 disabled:border-rule disabled:text-rule disabled:hover:bg-transparent"
          >
            −
          </button>
          <p className="font-num font-bold tracking-[-0.05em] tabular-nums" aria-live="polite">
            <span className="text-[44px]/none">{tip}</span>
            <span className="ml-0.5 align-[0.9em] text-[17px]/none text-ink-2">%</span>
          </p>
          <button
            type="button"
            data-role="tip"
            aria-label="Raise the tip"
            disabled={tip === MAX_TIP}
            onClick={() => {
              nudge(1)
            }}
            className="grid size-8 place-items-center rounded-full border border-ink text-[17px]/none text-ink transition-[background-color,color,scale] hover:bg-ink hover:text-paper active:scale-95 disabled:border-rule disabled:text-rule disabled:hover:bg-transparent"
          >
            +
          </button>
        </div>
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
          className="mt-1.5 h-[18px] w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-1.5 [&::-moz-range-thumb]:rounded-[2px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:h-0.5 [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-ink)_var(--fill),var(--color-rule)_var(--fill))] [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-ink"
        />
        <p aria-hidden className="relative h-3 font-num text-[9px]/none text-ink-2 tabular-nums">
          {SCALE.map((mark) => (
            <span key={mark} style={{ left: fillAt(mark) }} className="absolute -translate-x-1/2">
              {mark}
            </span>
          ))}
        </p>
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
