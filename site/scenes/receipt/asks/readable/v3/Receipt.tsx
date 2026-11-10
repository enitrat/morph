import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="readable"
      className="w-[300px] rotate-[0.5deg] [--color-accent:#2f5bd3] [--color-ink-2:#868a93] [--color-ink:#16181d] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#ededea] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="rounded-[16px] bg-paper px-5 pt-5 pb-4 font-body text-[13px]/[1.4] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_30px_50px_-24px_rgb(0_0_0/0.7)] [&_[data-role=group]]:pt-2.5 [&_[data-role=group]]:pb-0.5 [&_[data-role=group]]:text-[11px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:text-ink-2 [&_[data-role=line]]:py-[3px] [&_[data-role=price]]:text-ink-2 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:rounded-[7px] [&_[data-role=tip]]:border-rule [&_[data-role=tip]]:py-[5px] [&_[data-role=tip]]:text-[11.5px]/none [&_[data-role=tip]]:font-semibold [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-accent [&_[data-role=tip][aria-pressed=true]]:text-on-accent [&_[data-role=tips]]:mt-3 [&_[data-role=tips]]:gap-1.5 [&_[data-part=total]_[data-role=rule]]:hidden [&_[data-role=row]]:text-ink-2 [&_[data-role=grand]]:order-first [&_[data-role=grand]]:mb-2 [&_[data-role=grand]]:text-[40px]/none [&_[data-role=grand]]:font-bold [&_[data-role=grand]]:tracking-[-0.035em] [&_[data-role=grand]_[data-role=label]]:text-[12px] [&_[data-role=grand]_[data-role=label]]:font-medium [&_[data-role=grand]_[data-role=label]]:tracking-normal"
      >
        <header className="mb-4 flex items-baseline justify-between">
          <h3 data-role="heading" className="font-display text-[14px] font-semibold">
            {SHOP.name}
          </h3>
          <p data-role="meta" className="text-[11.5px] text-ink-2">
            14 Nov · {SHOP.time}
          </p>
        </header>
        <ReceiptTotal />
        <div className="mt-4 rounded-[12px] border border-rule px-3.5 pt-2.5 pb-3">
          <p
            data-role="meta"
            className="mb-1 flex justify-between text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
          >
            <span>Details</span>
            <span>Table {SHOP.table}</span>
          </p>
          <ReceiptItems />
        </div>
        <p data-role="meta" className="mt-3 text-center text-[11px] text-ink-2">
          Visa ending {SHOP.card} · #{SHOP.number}
        </p>
      </div>
    </article>
  )
}
