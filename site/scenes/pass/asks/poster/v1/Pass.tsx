import { FLIGHT } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="poster"
      className="w-[300px] -rotate-[0.6deg] [--color-accent:#e3261b] [--color-ink-2:#76746d] [--color-ink:#111111] [--color-on-accent:#ffffff] [--color-paper:#f4f3ee] [--color-rule:#d5d3cb] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-grotesk)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-5 pt-4 pb-5 font-body text-ink shadow-[0_30px_60px_-28px_rgb(0_0_0/0.8),0_1px_3px_rgb(0_0_0/0.25)] [&_[data-part=route]_[data-role=code]]:hidden [&_[data-role=label]]:tracking-[0.02em] [&_[data-role=label]]:normal-case [&_[data-role=label]]:text-ink [&_[data-role=seat-option]]:rounded-none [&_[data-role=value]]:font-extrabold"
      >
        <header className="flex items-baseline justify-between border-b border-ink pb-2 text-[11px]/none font-semibold">
          <h3 data-role="heading" className="font-display font-extrabold tracking-[-0.01em]">
            {FLIGHT.airline}
          </h3>
          <p data-role="meta" className="tabular-nums">
            {FLIGHT.number} · 14.11.26
          </p>
        </header>
        <p
          aria-label={`${FLIGHT.from.code} to ${FLIGHT.to.code}`}
          className="-ml-1 pt-2.5 font-display text-[76px]/[0.8] font-black tracking-[-0.065em]"
        >
          {FLIGHT.from.code}
          <br />
          {FLIGHT.to.code}
        </p>
        <hr data-role="rule" className="mt-2.5 mb-3 h-[6px] border-0 bg-accent" />
        <PassRoute />
        <div className="mt-4">
          <PassSeat />
        </div>
        <div className="mt-4 border-t border-ink pt-3">
          <PassStub />
        </div>
      </div>
    </article>
  )
}
