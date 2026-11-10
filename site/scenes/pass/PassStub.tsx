import { BARCODE, BARCODE_WIDTH, clock, FLIGHT, statusOf, useGate } from "./data"

export function PassStub() {
  const seconds = useGate()
  return (
    <section data-part="stub" className="grid gap-2.5">
      <p data-role="countdown" className="flex items-baseline justify-between gap-3">
        <span data-role="label" className="text-[10.5px] font-medium text-accent">
          <span data-role="status">{statusOf(seconds)}</span> · gate closes in
        </span>
        <span
          data-role="clock"
          className="font-num text-[22px]/none font-bold tracking-[-0.02em] tabular-nums"
        >
          {clock(seconds)}
        </span>
      </p>
      <svg
        data-role="barcode"
        viewBox={`0 0 ${BARCODE_WIDTH} 40`}
        preserveAspectRatio="none"
        className="h-[38px] w-full fill-current"
        aria-hidden
      >
        {BARCODE.map((bar) => (
          <rect key={bar.x} x={bar.x} width={bar.width} height={40} />
        ))}
      </svg>
      <p
        data-role="meta"
        className="flex justify-between text-[9.5px] tracking-[0.12em] text-ink-2 uppercase"
      >
        <span>Seq {FLIGHT.sequence}</span>
        <span>Ref {FLIGHT.ref}</span>
      </p>
    </section>
  )
}
