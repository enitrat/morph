import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="readable"
      className="w-[300px] -rotate-[0.8deg] [--color-accent:#1b1d22] [--color-ink-2:#878b93] [--color-ink:#1b1d22] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#e6e6e2] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="grid gap-2 rounded-[18px] bg-[color-mix(in_oklab,var(--color-paper),var(--color-ink)_8%)] p-2.5 font-body text-[13.5px]/[1.45] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_50px_-24px_rgb(0_0_0/0.7)] [&_[data-role=group]]:pt-2 [&_[data-role=group]]:text-[11px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:text-ink-2 [&_[data-role=line]]:py-[3px] [&_[data-role=price]]:text-ink/80 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:rounded-full [&_[data-role=tip]]:border-rule [&_[data-role=tip]]:py-[5px] [&_[data-role=tip]]:text-[11.5px]/none [&_[data-role=tip]]:font-medium [&_[data-role=tip][aria-pressed=true]]:border-ink [&_[data-role=tips]]:my-2 [&_[data-role=tips]]:gap-1.5 [&_[data-part=total]_[data-role=rule]]:my-2 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-role=row]]:py-px [&_[data-role=row]]:text-ink/65 [&_[data-role=grand]]:text-[17px] [&_[data-role=grand]]:font-semibold"
      >
        <header className="grid justify-items-center px-3 pt-4 pb-2 text-center">
          <span className="grid size-9 place-items-center rounded-full bg-accent text-[12px] font-semibold tracking-[0.04em] text-on-accent">
            AM
          </span>
          <h3 data-role="heading" className="mt-2.5 font-display text-[16px]/[1.2] font-semibold">
            {SHOP.name}
          </h3>
          <p data-role="meta" className="mt-0.5 text-[11.5px] text-ink-2">
            {SHOP.date} · {SHOP.time} · Table {SHOP.table}
          </p>
        </header>
        <section className="rounded-[12px] bg-paper px-4 pt-3 pb-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
          <p
            data-role="meta"
            className="mb-1.5 flex justify-between text-[11px] font-medium text-ink-2"
          >
            <span>Order</span>
            <span>#{SHOP.number}</span>
          </p>
          <ReceiptItems />
        </section>
        <section className="rounded-[12px] bg-paper px-4 pt-3 pb-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
          <ReceiptTotal />
        </section>
        <p data-role="meta" className="pt-1 pb-2 text-center text-[11px] text-ink-2">
          Paid by card ending {SHOP.card}. Thank you.
        </p>
      </div>
    </article>
  )
}
