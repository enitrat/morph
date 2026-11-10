import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="invoice"
      className="w-[300px] rotate-[0.8deg] [--color-accent:#20232a] [--color-ink-2:#868a92] [--color-ink:#20232a] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#e6e6e2] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-[22px] pt-6 pb-5 font-body text-[11.5px]/[1.45] text-ink shadow-[0_30px_50px_-24px_rgb(0_0_0/0.7),0_1px_3px_rgb(0_0_0/0.2)] [&_[data-role=group]]:border-b [&_[data-role=group]]:border-rule [&_[data-role=group]]:pt-2 [&_[data-role=group]]:pb-1 [&_[data-role=group]]:text-[9px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.1em] [&_[data-role=group]]:text-ink-2 [&_[data-role=group]]:uppercase [&_[data-role=line]]:border-b [&_[data-role=line]]:border-ink/6 [&_[data-role=line]:last-child]:border-b-0 [&_[data-role=line]]:py-1.5 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:rounded-[3px] [&_[data-role=tip]]:border-rule [&_[data-role=tip]]:text-[10.5px] [&_[data-role=tip]]:text-ink [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-accent [&_[data-role=tip][aria-pressed=true]]:text-on-accent [&_[data-role=tips]]:my-1 [&_[data-part=total]_[data-role=rule]]:mt-1.5 [&_[data-part=total]_[data-role=rule]]:mb-2 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-part=total]_[data-role=rule]]:border-ink [&_[data-role=row]]:py-px [&_[data-role=grand]]:text-[14px] [&_[data-role=grand]]:font-bold"
      >
        <header className="flex items-start justify-between border-b border-ink pb-3.5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-ink pb-px font-[family-name:var(--font-editorial)] text-[14px] text-paper italic">
              m
            </span>
            <div>
              <h3 data-role="heading" className="font-display text-[13px]/[1.15] font-semibold">
                {SHOP.name}
              </h3>
              <p data-role="meta" className="text-[10px] text-ink-2">
                {SHOP.street}, {SHOP.city}
              </p>
            </div>
          </div>
          <p className="text-right font-display text-[22px]/none font-medium tracking-[-0.01em]">
            Invoice
            <span data-role="meta" className="mt-1 block text-[10px] tracking-normal text-ink-2">
              No. 2026-{SHOP.number}
            </span>
          </p>
        </header>
        <dl className="my-3.5 grid grid-cols-2 gap-2.5">
          <div>
            <dt
              data-role="meta"
              className="text-[9px] font-semibold tracking-[0.1em] text-ink-2 uppercase"
            >
              Billed to
            </dt>
            <dd className="mt-0.5 font-medium">Table {SHOP.table}</dd>
          </div>
          <div>
            <dt
              data-role="meta"
              className="text-[9px] font-semibold tracking-[0.1em] text-ink-2 uppercase"
            >
              Issued
            </dt>
            <dd className="mt-0.5 font-medium">
              {SHOP.date}, {SHOP.time}
            </dd>
          </div>
        </dl>
        <p
          data-role="meta"
          className="flex justify-between border-b border-rule pb-1.5 text-[9px] font-semibold tracking-[0.1em] text-ink-2 uppercase"
        >
          <span>Item</span>
          <span>Amount</span>
        </p>
        <ReceiptItems />
        <div className="mt-3 border-t border-ink pt-2.5">
          <ReceiptTotal />
        </div>
        <p data-role="meta" className="mt-4 text-[10px] text-ink-2">
          Paid by card ending {SHOP.card}. Thank you.
        </p>
      </div>
    </article>
  )
}
