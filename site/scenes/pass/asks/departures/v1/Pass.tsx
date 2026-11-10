import { FLIGHT, useFlap, useSeat } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

/** One word of split-flap letters, each on its own hinged tile. */
function Flaps({ text, cell }: { text: string; cell: string }) {
  const shown = useFlap(text)
  return (
    <span aria-label={text} className="flex gap-[2px]">
      {[...shown].map((char, at) => (
        <span
          key={at}
          data-role="flap"
          aria-hidden
          className={`relative grid place-items-center overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--color-ink)_9%,var(--color-paper))] font-num font-bold text-accent after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-paper/60 ${cell}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

const caption = "text-[8.5px] font-semibold tracking-[0.16em] text-ink-2 uppercase"

export function Pass() {
  const [seat] = useSeat()
  return (
    <article
      data-object="pass"
      data-layout="departures"
      className="w-[300px] -rotate-[1deg] [--color-accent:#ffd23f] [--color-ink-2:#8c8e96] [--color-ink:#f1efe8] [--color-on-accent:#141519] [--color-paper:#141519] [--color-rule:#2d2f36] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="rounded-[10px] bg-paper px-5 pt-4 pb-5 font-body text-ink shadow-[0_30px_60px_-26px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.06)] [&_[data-part=route]_[data-role=code]]:hidden [&_[data-role=clock]]:text-accent"
      >
        <header className="flex items-baseline justify-between">
          <h3
            data-role="heading"
            className="font-display text-[11px] font-bold tracking-[0.2em] text-accent uppercase"
          >
            Departures
          </h3>
          <p data-role="meta" className="text-[10px] text-ink-2">
            {FLIGHT.airline} · {FLIGHT.from.city} T{FLIGHT.from.terminal}
          </p>
        </header>
        <p className={`mt-3 ${caption}`}>Destination</p>
        <div className="mt-1">
          <Flaps text={FLIGHT.to.city} cell="h-[30px] w-[22px] text-[18px]" />
        </div>
        <div className="mt-2.5 flex justify-between">
          <div>
            <p className={caption}>Flight</p>
            <div className="mt-1">
              <Flaps text={FLIGHT.number.replace(" ", "")} cell="h-[22px] w-[15px] text-[13px]" />
            </div>
          </div>
          <div>
            <p className={caption}>Gate</p>
            <div className="mt-1">
              <Flaps text={FLIGHT.gate} cell="h-[22px] w-[15px] text-[13px]" />
            </div>
          </div>
          <div>
            <p className={caption}>Seat</p>
            <div className="mt-1">
              <Flaps text={seat.id.padEnd(3)} cell="h-[22px] w-[15px] text-[13px]" />
            </div>
          </div>
        </div>
        <hr data-role="rule" className="my-3 border-0 border-t border-rule" />
        <PassRoute />
        <div className="mt-3.5">
          <PassSeat />
        </div>
        <div className="mt-4 border-t border-rule pt-3">
          <PassStub />
        </div>
      </div>
    </article>
  )
}
