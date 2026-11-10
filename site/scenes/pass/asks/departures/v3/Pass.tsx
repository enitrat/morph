import { FLIGHT, statusOf, useFlap, useGate, useSeat } from "./data"
import { PassRoute } from "./PassRoute"
import { PassSeat } from "./PassSeat"
import { PassStub } from "./PassStub"

function Flaps({ text, cell }: { text: string; cell: string }) {
  const shown = useFlap(text)
  return (
    <span aria-label={text.trim()} className="flex gap-[2px]">
      {[...shown].map((char, at) => (
        <span
          key={at}
          data-role="flap"
          aria-hidden
          className={`relative grid place-items-center overflow-hidden bg-[color-mix(in_srgb,var(--color-ink)_10%,var(--color-paper))] font-num font-bold after:absolute after:inset-x-0 after:top-1/2 after:h-[1.5px] after:bg-paper/60 ${cell}`}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

export function Pass() {
  const [seat] = useSeat()
  const seconds = useGate()
  return (
    <article
      data-object="pass"
      data-layout="gate-screen"
      className="w-[300px] rounded-[16px] bg-[color-mix(in_srgb,var(--color-ink)_16%,var(--color-paper))] p-[6px] shadow-[0_30px_60px_-26px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.08)] [--color-accent:#ffd23f] [--color-ink-2:#8d9099] [--color-ink:#f3f1ea] [--color-on-accent:#0c0d10] [--color-paper:#0c0d10] [--color-rule:#25272d] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="rounded-[11px] bg-paper px-4 pt-4 pb-4 font-body text-ink [&_[data-part=route]_[data-role=code]]:hidden [&_[data-role=clock]]:text-accent"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              data-role="heading"
              className="font-display text-[10px] font-bold tracking-[0.22em] text-ink-2 uppercase"
            >
              Gate
            </h3>
            <div className="mt-1.5 text-accent">
              <Flaps text={FLIGHT.gate} cell="h-[56px] w-[34px] rounded-[4px] text-[40px]" />
            </div>
          </div>
          <div className="grid justify-items-end gap-1.5 pt-[18px] text-ink">
            <Flaps
              text={FLIGHT.number.replace(" ", "")}
              cell="h-[18px] w-[11px] rounded-[2px] text-[11px]"
            />
            <Flaps text={FLIGHT.to.city} cell="h-[18px] w-[11px] rounded-[2px] text-[11px]" />
            <Flaps
              text={`${FLIGHT.from.time} ${seat.id.padStart(3)}`}
              cell="h-[18px] w-[11px] rounded-[2px] text-[11px]"
            />
          </div>
        </div>
        <p className="-mx-4 mt-3 flex items-center justify-between bg-accent px-4 py-1.5 text-[10.5px] font-bold tracking-[0.14em] text-on-accent uppercase">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-on-accent" />
            {statusOf(seconds)}
          </span>
          <span>{FLIGHT.airline}</span>
        </p>
        <div className="mt-3.5">
          <PassRoute />
        </div>
        <div className="mt-3.5">
          <PassSeat />
        </div>
        <hr data-role="rule" className="my-3.5 border-0 border-t border-rule" />
        <PassStub />
      </div>
    </article>
  )
}
