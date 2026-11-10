import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="invoice"
      className="w-[300px] rotate-[0.6deg] [--color-accent:#20232a] [--color-ink-2:#8a8e96] [--color-ink:#20232a] [--color-on-accent:#ffffff] [--color-paper:#fbfbf9] [--color-rule:#e4e4df] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-6 pt-6 pb-5 font-body text-[11.5px]/[1.45] text-ink shadow-[0_30px_50px_-24px_rgb(0_0_0/0.7),0_1px_3px_rgb(0_0_0/0.2)] [&_[data-role=group]]:pt-2 [&_[data-role=group]]:text-[9px] [&_[data-role=group]]:font-medium [&_[data-role=group]]:tracking-[0.12em] [&_[data-role=group]]:text-ink-2 [&_[data-role=group]]:uppercase [&_[data-role=line]]:py-1 [&_[data-role=price]]:text-ink-2 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:rounded-full [&_[data-role=tip]]:border-rule [&_[data-role=tip]]:py-[3px] [&_[data-role=tip]]:text-[10.5px] [&_[data-role=tip][aria-pressed=true]]:border-ink [&_[data-role=tips]]:mt-2.5 [&_[data-role=tips]]:mb-0 [&_[data-part=total]_[data-role=rule]]:hidden [&_[data-role=row]]:text-ink-2 [&_[data-role=grand]]:order-first [&_[data-role=grand]]:mb-2.5 [&_[data-role=grand]]:flex-col [&_[data-role=grand]]:items-start [&_[data-role=grand]]:gap-1.5 [&_[data-role=grand]]:text-[46px]/[0.95] [&_[data-role=grand]]:font-light [&_[data-role=grand]]:tracking-[-0.045em] [&_[data-role=grand]_[data-role=label]]:text-[9.5px] [&_[data-role=grand]_[data-role=label]]:font-medium [&_[data-role=grand]_[data-role=label]]:tracking-[0.14em] [&_[data-role=grand]_[data-role=label]]:uppercase"
      >
        <header className="mb-5 flex items-baseline justify-between">
          <h3 data-role="heading" className="font-display text-[12px] font-semibold">
            {SHOP.name}
          </h3>
          <p data-role="meta" className="text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Statement
          </p>
        </header>
        <ReceiptTotal />
        <p data-role="meta" className="mt-3 text-[10.5px] text-ink-2">
          Invoice 2026-{SHOP.number} · Table {SHOP.table} · due on receipt
        </p>
        <hr data-role="rule" className="my-4 border-0 border-t border-ink" />
        <ReceiptItems />
        <p data-role="meta" className="mt-4 flex justify-between text-[10px] text-ink-2">
          <span>Issued {SHOP.date}</span>
          <span>Card {SHOP.card}</span>
        </p>
      </div>
    </article>
  )
}
