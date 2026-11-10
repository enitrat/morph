import { BARCODE, BARCODE_WIDTH, SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="thermal"
      className="w-[280px] -rotate-[1.2deg] drop-shadow-[0_22px_24px_rgb(0_0_0/0.55)] [--color-ink-2:#77787c] [--color-ink:#3a3b3f] [--color-paper:#f6f4ee] [--color-rule:#b9b8b2] [--font-body:var(--font-thermal)] [--font-display:var(--font-thermal)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-5 pt-6 pb-9 font-body text-[12px]/[1.55] text-ink [mask:conic-gradient(from_-45deg_at_bottom,#0000,#000_1deg_89deg,#0000_90deg)_50%/12px_100%] [&_[data-role=label]]:uppercase"
      >
        <header className="text-center">
          <h3
            data-role="heading"
            className="font-display text-[15px]/[1.2] font-bold tracking-[0.18em] uppercase"
          >
            {SHOP.name}
          </h3>
          <p data-role="meta" className="mt-1 text-[10.5px] text-ink-2">
            {SHOP.street} · Table {SHOP.table}
            <br />
            14/11 {SHOP.time} · #{SHOP.number}
          </p>
        </header>
        <hr data-role="rule" className="my-2.5 border-0 border-t border-dashed border-rule" />
        <ReceiptItems />
        <hr data-role="rule" className="my-2.5 border-0 border-t border-dashed border-rule" />
        <ReceiptTotal />
        <footer className="mt-3 text-center">
          <p data-role="meta" className="text-[10.5px] tracking-[0.08em] text-ink-2">
            MERCI · À BIENTÔT
          </p>
          <svg
            data-role="barcode"
            viewBox={`0 0 ${BARCODE_WIDTH} 30`}
            preserveAspectRatio="none"
            className="mt-2 h-[30px] w-full fill-current"
            aria-hidden
          >
            {BARCODE.map((bar) => (
              <rect key={bar.x} x={bar.x} width={bar.width} height={30} />
            ))}
          </svg>
        </footer>
      </div>
    </article>
  )
}
