import { FLIGHT, MARK } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="paper"
      className="w-[300px] rotate-[1.4deg] [--color-accent:#1b3a6b] [--color-ink-2:#6b6f78] [--color-ink:#15171c] [--color-on-accent:#ffffff] [--color-paper:#fbfaf6] [--color-rule:#dcd8ce] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="relative overflow-hidden rounded-[14px] bg-paper px-[22px] pt-5 pb-5 font-body text-ink shadow-[0_30px_50px_-24px_rgb(0_0_0/0.75),0_2px_6px_rgb(0_0_0/0.3)]"
      >
        <header className="flex items-center justify-between">
          <h3
            data-role="heading"
            className="flex items-center gap-1.5 font-display text-[14px] font-bold tracking-[-0.01em] text-accent"
          >
            <svg viewBox="0 0 24 24" className="size-[18px] fill-current" aria-hidden>
              <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d={MARK} />
            </svg>
            {FLIGHT.airline}
          </h3>
          <p
            data-role="meta"
            className="text-[9.5px] font-medium tracking-[0.16em] text-ink-2 uppercase"
          >
            Boarding pass
          </p>
        </header>
        <div className="mt-5">
          <PassRoute />
        </div>
        <dl className="mt-6 grid grid-cols-[1.6fr_1fr_1fr] gap-2 border-t border-rule pt-3">
          <div data-role="field" data-field="passenger">
            <dt
              data-role="label"
              className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
            >
              Passenger
            </dt>
            <dd data-role="value" className="mt-1 text-[13px] font-semibold">
              {FLIGHT.passenger}
            </dd>
          </div>
          <div data-role="field" data-field="flight">
            <dt
              data-role="label"
              className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
            >
              Flight
            </dt>
            <dd data-role="value" className="mt-1 text-[13px] font-semibold">
              {FLIGHT.number}
            </dd>
          </div>
          <div data-role="field" data-field="date">
            <dt
              data-role="label"
              className="text-[9px] font-semibold tracking-[0.12em] text-ink-2 uppercase"
            >
              Date
            </dt>
            <dd data-role="value" className="mt-1 text-[13px] font-semibold">
              14 Nov
            </dd>
          </div>
        </dl>
        <div className="mt-3.5">
          <PassSeat />
        </div>
        <div data-role="tear" className="relative -mx-[22px] my-4">
          <span
            data-role="notch"
            className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-full bg-[var(--color-board)]"
          />
          <hr
            data-role="rule"
            className="mx-4 border-0 border-t-[1.5px] border-dashed border-rule"
          />
          <span
            data-role="notch"
            className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-full bg-[var(--color-board)]"
          />
        </div>
        <PassStub />
      </div>
    </article>
  )
}
