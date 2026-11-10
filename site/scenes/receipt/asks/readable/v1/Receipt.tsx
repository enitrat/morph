import { ITEMS, SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

const COUNT = ITEMS.reduce((sum, item) => sum + item.qty, 0)

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="readable"
      className="w-[300px] rotate-[0.6deg] [--color-accent:#1d7a46] [--color-ink-2:#868a93] [--color-ink:#1b1d22] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#ededeb] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="rounded-[14px] bg-paper p-[18px] font-body text-[13px]/[1.4] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_30px_50px_-24px_rgb(0_0_0/0.7)] [&_[data-role=group]]:pt-3 [&_[data-role=group]]:pb-1 [&_[data-role=group]]:text-[11px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.06em] [&_[data-role=group]]:text-ink-2 [&_[data-role=group]]:uppercase [&_[data-role=line]]:border-t [&_[data-role=line]]:border-rule [&_[data-role=line]]:py-1.5 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:border-0 [&_[data-role=tip]]:py-0 [&_[data-role=tip]]:text-[11.5px]/[1.9] [&_[data-role=tip]]:font-semibold [&_[data-role=tip]]:text-ink-2 [&_[data-role=tip][aria-pressed=true]]:bg-paper [&_[data-role=tip][aria-pressed=true]]:text-ink [&_[data-role=tip][aria-pressed=true]]:shadow-[0_1px_2px_rgb(0_0_0/0.14)] [&_[data-role=tips]]:gap-0.5 [&_[data-role=tips]]:rounded-[8px] [&_[data-role=tips]]:bg-ink/7 [&_[data-role=tips]]:p-[3px] [&_[data-part=total]_[data-role=rule]]:my-2 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-part=total]_[data-role=rule]]:border-ink/10 [&_[data-role=row]]:py-px [&_[data-role=row]]:text-ink/65 [&_[data-role=grand]]:text-[18px] [&_[data-role=grand]]:font-bold"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 data-role="heading" className="font-display text-[15px]/[1.2] font-semibold">
              {SHOP.name}
            </h3>
            <p data-role="meta" className="mt-0.5 text-[11.5px] text-ink-2">
              Table {SHOP.table} · 14 Nov, {SHOP.time}
            </p>
          </div>
          <span className="rounded-full bg-accent/10 px-2 py-[5px] text-[10.5px]/none font-semibold text-accent">
            Paid · Card
          </span>
        </header>
        <p
          data-role="meta"
          className="mt-4 mb-1 flex justify-between text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
        >
          <span>Your order</span>
          <span className="tabular-nums">{COUNT} items</span>
        </p>
        <ReceiptItems />
        <div className="mt-3 rounded-[10px] bg-ink/4 px-3 pt-2.5 pb-3">
          <ReceiptTotal />
        </div>
        <p data-role="meta" className="mt-3 text-center text-[11px] text-ink-2">
          Card ending {SHOP.card} · Receipt #{SHOP.number}
        </p>
      </div>
    </article>
  )
}
