import { FLIGHT, MARK } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="wallet-stack"
      className="w-[300px] rotate-[1deg] [--color-accent:#0d7a6f] [--color-ink-2:#6f7580] [--color-ink:#14171c] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#e5e6e8] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div aria-hidden className="mx-5 h-3 rounded-t-[16px] bg-[#c9d7e8] opacity-70" />
      <div
        aria-hidden
        className="mx-2.5 flex h-4 items-start justify-between rounded-t-[18px] bg-[#f0d9b5] px-3 pt-1 text-[7.5px] font-semibold tracking-[0.14em] text-[#7a5a2a] uppercase"
      >
        <span>Return · NW 483</span>
        <span>21 Nov</span>
      </div>
      <div
        data-role="paper"
        className="overflow-hidden rounded-[20px] bg-paper font-body text-ink shadow-[0_34px_60px_-26px_rgb(0_0_0/0.85),0_-1px_0_rgb(0_0_0/0.06)] [&_[data-role=barcode]]:mx-auto [&_[data-role=barcode]]:h-[44px] [&_[data-role=barcode]]:w-[86%] [&_[data-role=seat-option]]:rounded-[14px] [&_[data-role=countdown]]:justify-center [&_[data-role=countdown]]:gap-2"
      >
        <header className="flex items-center justify-between bg-accent px-5 py-3 text-on-accent">
          <h3
            data-role="heading"
            className="flex items-center gap-1.5 font-display text-[14px] font-semibold"
          >
            <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
              <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d={MARK} />
            </svg>
            {FLIGHT.airline}
          </h3>
          <p data-role="meta" className="text-right text-[10px]/[1.25] opacity-85">
            {FLIGHT.number}
            <br />
            {FLIGHT.day}
          </p>
        </header>
        <div className="px-5 pt-4">
          <PassRoute />
          <div className="mt-4">
            <PassSeat />
          </div>
        </div>
        <div className="mt-4 border-t border-dashed border-rule bg-[color-mix(in_srgb,var(--color-ink)_3%,var(--color-paper))] px-5 pt-3 pb-4">
          <PassStub />
        </div>
      </div>
    </article>
  )
}
