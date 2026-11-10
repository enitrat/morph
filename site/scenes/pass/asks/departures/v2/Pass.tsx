import { FLIGHT, statusOf, useFlap, useGate } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

const ROWS = [
  { time: "09:55", to: "Madrid", gate: "A04", ours: false },
  { time: FLIGHT.from.time, to: FLIGHT.to.city, gate: FLIGHT.gate, ours: true },
  { time: "10:40", to: "Oslo", gate: "B03", ours: false },
]

function Flaps({ text }: { text: string }) {
  const shown = useFlap(text)
  return (
    <span aria-label={text.trim()} className="flex gap-px">
      {[...shown].map((char, at) => (
        <span
          key={at}
          data-role="flap"
          aria-hidden
          className="relative grid h-[17px] w-[11px] place-items-center rounded-[2px] bg-[color-mix(in_srgb,var(--color-ink)_9%,var(--color-paper))] font-num text-[10.5px] font-bold after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-paper/60"
        >
          {char}
        </span>
      ))}
    </span>
  )
}

export function Pass() {
  const seconds = useGate()
  return (
    <article
      data-object="pass"
      data-layout="station-board"
      className="w-[300px] rotate-[0.6deg] [--color-accent:#ffb627] [--color-ink-2:#7f838d] [--color-ink:#ecebe4] [--color-on-accent:#101114] [--color-paper:#101114] [--color-rule:#272a31] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="rounded-[8px] bg-paper px-[18px] pt-4 pb-5 font-body text-ink shadow-[0_30px_60px_-26px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.07)] [&_[data-part=route]_[data-role=code]]:hidden [&_[data-role=clock]]:text-accent"
      >
        <header className="flex items-baseline justify-between border-b border-rule pb-2">
          <h3
            data-role="heading"
            className="font-display text-[15px] font-extrabold tracking-[-0.01em]"
          >
            Departures
          </h3>
          <p data-role="meta" className="text-[10px] text-ink-2">
            {FLIGHT.from.city} · terminal {FLIGHT.from.terminal}
          </p>
        </header>
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-1.5 text-[8.5px] font-semibold tracking-[0.14em] text-ink-2 uppercase">
          <span>Time</span>
          <span>To</span>
          <span>Gate</span>
        </div>
        <ol className="mt-1 grid gap-[3px]">
          {ROWS.map((row) => (
            <li
              key={row.time}
              className={`-mx-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 rounded-[4px] px-1.5 py-[3px] ${row.ours ? "bg-accent/15 text-accent ring-1 ring-accent/50" : "text-ink/55"}`}
            >
              <Flaps text={row.time} />
              <Flaps text={row.to.padEnd(10)} />
              <Flaps text={row.gate} />
            </li>
          ))}
        </ol>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-2">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
          <span data-role="meta">
            {FLIGHT.number} · {statusOf(seconds)} · {FLIGHT.passenger}
          </span>
        </p>
        <hr data-role="rule" className="my-3 border-0 border-t border-rule" />
        <PassRoute />
        <div className="mt-3.5">
          <PassSeat />
        </div>
        <div className="mt-4 border-t border-dashed border-rule pt-3">
          <PassStub />
        </div>
      </div>
    </article>
  )
}
