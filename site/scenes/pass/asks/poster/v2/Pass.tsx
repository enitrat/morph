import { FLIGHT } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="poster-spine"
      className="w-[300px] rotate-[0.8deg] [--color-accent:#111111] [--color-ink-2:#ffd0cb] [--color-ink:#ffffff] [--color-on-accent:#ffffff] [--color-paper:#e3261b] [--color-rule:#f27a71] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-grotesk)]"
    >
      <div
        data-role="paper"
        className="grid grid-cols-[62px_minmax(0,1fr)] gap-x-3 bg-paper py-4 pr-4 pl-3 font-body text-ink shadow-[0_30px_60px_-28px_rgb(0_0_0/0.8),0_1px_3px_rgb(0_0_0/0.25)] [&_[data-part=route]_[data-role=code]]:hidden [&_[data-role=kind]]:hidden [&_[data-role=label]]:tracking-[0.02em] [&_[data-role=label]]:normal-case [&_[data-role=countdown]_[data-role=label]]:text-[9.5px] [&_[data-role=clock]]:text-[19px] [&_[data-role=seat-option]]:rounded-none [&_[data-role=seat-option]]:border-ink [&_[data-role=seat-option]]:text-ink"
      >
        <p
          aria-label={`${FLIGHT.from.code} to ${FLIGHT.to.code}`}
          className="row-span-3 flex rotate-180 justify-end gap-2 font-display text-[80px]/[0.78] font-black tracking-[-0.05em] [writing-mode:vertical-rl]"
        >
          <span>{FLIGHT.from.code}</span>
          <span className="text-accent">{FLIGHT.to.code}</span>
        </p>
        <header className="flex items-baseline justify-between border-b-[3px] border-accent pb-2 text-[11px]/none font-bold">
          <h3 data-role="heading" className="font-display font-extrabold">
            {FLIGHT.airline}
          </h3>
          <p data-role="meta" className="tabular-nums">
            {FLIGHT.number}
          </p>
        </header>
        <div className="pt-3">
          <dl className="mb-4 grid grid-cols-[1.4fr_1fr] gap-2 border-b border-rule pb-3">
            <div data-role="field" data-field="passenger">
              <dt data-role="label" className="text-[9px] font-semibold text-ink-2">
                Passenger
              </dt>
              <dd data-role="value" className="mt-0.5 text-[13px] font-bold">
                {FLIGHT.passenger}
              </dd>
            </div>
            <div data-role="field" data-field="date">
              <dt data-role="label" className="text-[9px] font-semibold text-ink-2">
                Date
              </dt>
              <dd data-role="value" className="mt-0.5 text-[13px] font-bold">
                {FLIGHT.day}
              </dd>
            </div>
          </dl>
          <PassRoute />
          <div className="mt-4">
            <PassSeat />
          </div>
        </div>
        <div className="mt-4 self-end border-t-[3px] border-accent pt-3">
          <PassStub />
        </div>
      </div>
    </article>
  )
}
