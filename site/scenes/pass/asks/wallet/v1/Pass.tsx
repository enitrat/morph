import { FLIGHT, MARK } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="wallet"
      className="w-[300px] -rotate-[1.2deg] [--color-accent:#8fd0ff] [--color-ink-2:#a3aec6] [--color-ink:#ffffff] [--color-on-accent:#15264a] [--color-paper:#15264a] [--color-rule:rgb(255_255_255/0.16)] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="relative overflow-hidden rounded-[22px] bg-paper px-5 pt-4 pb-5 font-body text-ink shadow-[0_34px_60px_-26px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.12)] [&_[data-role=barcode]]:rounded-[8px] [&_[data-role=barcode]]:bg-white [&_[data-role=barcode]]:p-2 [&_[data-role=barcode]]:text-black [&_[data-role=barcode]]:h-[52px] [&_[data-role=seat-option]]:rounded-[14px]"
      >
        <header className="flex items-center justify-between">
          <h3
            data-role="heading"
            className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-[-0.01em]"
          >
            <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                <path d={MARK} />
              </svg>
            </span>
            {FLIGHT.airline}
          </h3>
          <div data-role="field" data-field="flight" className="text-right">
            <p
              data-role="label"
              className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
            >
              Flight
            </p>
            <p data-role="value" className="text-[15px]/none font-semibold">
              {FLIGHT.number}
            </p>
          </div>
        </header>
        <div className="mt-4">
          <PassRoute />
        </div>
        <div data-role="field" data-field="passenger" className="mt-4">
          <p
            data-role="label"
            className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
          >
            Passenger
          </p>
          <p data-role="value" className="mt-0.5 text-[14px] font-semibold">
            {FLIGHT.passenger}
          </p>
        </div>
        <div className="mt-3">
          <PassSeat />
        </div>
        <div data-role="tear" aria-hidden className="relative -mx-5 my-4">
          <span
            data-role="notch"
            className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-[var(--color-board)]"
          />
          <hr data-role="rule" className="mx-5 border-0 border-t-2 border-dotted border-rule" />
          <span
            data-role="notch"
            className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-[var(--color-board)]"
          />
        </div>
        <PassStub />
      </div>
    </article>
  )
}
