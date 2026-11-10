import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="invoice"
      className="w-[300px] -rotate-[0.7deg] [--color-accent:#1f3d5c] [--color-ink-2:#7f8792] [--color-ink:#1c2430] [--color-on-accent:#ffffff] [--color-paper:#ffffff] [--color-rule:#e2e5ea] [--font-body:var(--font-sans)] [--font-display:var(--font-grotesk)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="overflow-hidden rounded-[4px] bg-paper font-body text-[11.5px]/[1.45] text-ink shadow-[0_30px_50px_-24px_rgb(0_0_0/0.7),0_1px_3px_rgb(0_0_0/0.2)] [&_[data-role=group]]:pt-2 [&_[data-role=group]]:pb-1 [&_[data-role=group]]:text-[9px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.1em] [&_[data-role=group]]:text-accent [&_[data-role=group]]:uppercase [&_[data-role=line]]:py-[5px] [&_[data-role=line]:nth-child(even)]:bg-accent/4 [&_[data-role=line]]:-mx-2 [&_[data-role=line]]:px-2 [&_[data-role=qty]]:text-ink-2 [&_[data-role=tip]]:rounded-[3px] [&_[data-role=tip]]:border-rule [&_[data-role=tip]]:text-[10.5px] [&_[data-role=tip]]:text-ink [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-accent [&_[data-role=tip][aria-pressed=true]]:text-on-accent [&_[data-role=tips]]:my-1.5 [&_[data-part=total]_[data-role=rule]]:my-2 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-part=total]_[data-role=rule]]:border-accent [&_[data-role=row]]:py-px [&_[data-role=grand]]:text-[15px] [&_[data-role=grand]]:font-bold"
      >
        <header className="flex items-start justify-between bg-accent px-[22px] pt-5 pb-[18px] text-on-accent">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-on-accent pb-px font-[family-name:var(--font-editorial)] text-[14px] text-accent italic">
              m
            </span>
            <div>
              <h3 data-role="heading" className="text-[13px]/[1.15] font-semibold">
                {SHOP.name}
              </h3>
              <p data-role="meta" className="text-[10px] opacity-70">
                {SHOP.street}
              </p>
            </div>
          </div>
          <p className="text-right font-display text-[19px]/none font-bold tracking-[0.08em] uppercase">
            Invoice
            <span
              data-role="meta"
              className="mt-1.5 block font-body text-[10px] font-normal tracking-normal normal-case opacity-70"
            >
              No. 2026-{SHOP.number}
            </span>
          </p>
        </header>
        <div className="px-[22px] pt-4 pb-5">
          <dl className="mb-4 grid grid-cols-3 gap-2 border-b border-rule pb-3.5">
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
              <dd className="mt-0.5 font-medium">{SHOP.date}</dd>
            </div>
            <div>
              <dt
                data-role="meta"
                className="text-[9px] font-semibold tracking-[0.1em] text-ink-2 uppercase"
              >
                Due
              </dt>
              <dd className="mt-0.5 font-medium">On receipt</dd>
            </div>
          </dl>
          <p
            data-role="meta"
            className="mb-1 flex justify-between text-[9px] font-semibold tracking-[0.1em] text-accent uppercase"
          >
            <span>Description</span>
            <span>EUR</span>
          </p>
          <ReceiptItems />
          <div className="mt-3 border-t border-rule pt-3">
            <ReceiptTotal />
          </div>
        </div>
        <p
          data-role="meta"
          className="flex justify-between border-t border-rule bg-accent/5 px-[22px] py-2.5 text-[10px] text-ink-2"
        >
          <span>Paid · card {SHOP.card}</span>
          <span>{SHOP.city}</span>
        </p>
      </div>
    </article>
  )
}
