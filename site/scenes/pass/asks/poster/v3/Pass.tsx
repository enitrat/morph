import { FLIGHT } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

export function Pass() {
  return (
    <article
      data-object="pass"
      data-layout="poster-grid"
      className="w-[300px] [--color-accent:#e3261b] [--color-ink-2:#8a8984] [--color-ink:#f2f1ec] [--color-on-accent:#ffffff] [--color-paper:#111111] [--color-rule:#2e2e2e] [--font-body:var(--font-grotesk)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-grotesk)]"
    >
      <div
        data-role="paper"
        className="grid grid-cols-[minmax(0,1fr)] bg-paper font-body text-ink shadow-[0_30px_60px_-28px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.06)] [&_[data-role=label]]:text-accent [&_[data-role=seat-option]]:rounded-none [&>section]:border-b [&>section]:border-rule [&>section]:px-4 [&>section]:py-3"
      >
        <header className="flex items-baseline justify-between px-4 pt-3.5 pb-2 text-[10.5px]/none font-semibold">
          <h3
            data-role="heading"
            className="font-display font-extrabold tracking-[0.02em] uppercase"
          >
            {FLIGHT.airline}
          </h3>
          <p data-role="meta" className="text-ink-2 tabular-nums">
            {FLIGHT.number} / {FLIGHT.day}
          </p>
        </header>
        <section className="grid grid-cols-[18px_minmax(0,1fr)] border-t border-rule">
          <span className="font-num text-[10px] font-bold text-accent">1</span>
          <PassRoute />
        </section>
        <section className="grid grid-cols-[18px_minmax(0,1fr)]">
          <span className="font-num text-[10px] font-bold text-accent">2</span>
          <PassSeat />
        </section>
        <section className="grid grid-cols-[18px_minmax(0,1fr)]">
          <span className="font-num text-[10px] font-bold text-accent">3</span>
          <PassStub />
        </section>
        <p
          aria-hidden
          className="flex items-baseline justify-between overflow-hidden px-3.5 pt-2 pb-1 font-display text-[52px]/[0.8] font-black tracking-[-0.06em]"
        >
          <span>{FLIGHT.from.code}</span>
          <span className="text-[40px] text-accent">→</span>
          <span>{FLIGHT.to.code}</span>
        </p>
      </div>
    </article>
  )
}
