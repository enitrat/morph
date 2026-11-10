import { elapsedOf, FLIGHT, MARK, useGate, useSeat } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  const seconds = useGate()
  const [seat] = useSeat()
  return (
    <article
      data-object="pass"
      data-layout="live-activity"
      className="w-[300px] -rotate-[0.8deg] [--color-accent:#ff9f43] [--color-ink-2:#8e8e95] [--color-ink:#f5f5f7] [--color-on-accent:#1a1006] [--color-paper:#0d0d0f] [--color-rule:#2a2a2e] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="rounded-[32px] bg-paper px-5 pt-4 pb-5 font-body text-ink shadow-[0_34px_60px_-24px_rgb(0_0_0/0.95),0_0_0_1px_rgb(255_255_255/0.08)] [&_[data-role=barcode]]:h-[30px] [&_[data-role=barcode]]:opacity-80 [&_[data-role=clock]]:text-[34px] [&_[data-role=clock]]:text-accent [&_[data-role=seat-option]]:rounded-[14px] [&_[data-role=seat-option]]:border-rule [&_[data-role=seat-option][aria-pressed=true]]:border-accent"
      >
        <header className="flex items-center justify-between">
          <h3
            data-role="heading"
            className="flex items-center gap-1.5 font-display text-[12px] font-semibold"
          >
            <span className="grid size-5 place-items-center rounded-full bg-accent text-on-accent">
              <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden>
                <path d={MARK} />
              </svg>
            </span>
            {FLIGHT.airline} {FLIGHT.number}
          </h3>
          <p
            data-role="meta"
            className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent"
          >
            Gate {FLIGHT.gate} · {seat.id}
          </p>
        </header>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.round(elapsedOf(seconds) * 1000) / 10}%` }}
          />
        </div>
        <div className="mt-4">
          <PassStub />
        </div>
        <div className="mt-4 rounded-[18px] bg-[color-mix(in_srgb,var(--color-ink)_7%,var(--color-paper))] p-3.5">
          <PassRoute />
        </div>
        <div className="mt-3.5 px-0.5">
          <PassSeat />
        </div>
      </div>
    </article>
  )
}
