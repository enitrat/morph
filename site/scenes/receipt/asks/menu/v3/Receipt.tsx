import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="menu"
      className="w-[290px] -rotate-[0.8deg] [--color-accent:#7a1f1f] [--color-ink-2:#7d6158] [--color-ink:#1d1a16] [--color-on-accent:#f3ddd4] [--color-paper:#f3ddd4] [--color-rule:#d9b9ad] [--font-body:var(--font-editorial)] [--font-display:var(--font-editorial)] [--font-num:var(--font-editorial)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-7 pt-7 pb-6 text-left font-body text-[13px]/[1.5] text-ink shadow-[0_30px_60px_-26px_rgb(0_0_0/0.75),0_1px_3px_rgb(0_0_0/0.25)] [&_[data-role=group]]:mt-3 [&_[data-role=group]]:mb-0.5 [&_[data-role=group]]:text-[9.5px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.2em] [&_[data-role=group]]:text-accent [&_[data-role=group]]:uppercase [&_[data-role=line]]:gap-0 [&_[data-role=line]]:text-[13.5px]/[1.75] [&_[data-role=name]]:flex-initial [&_[data-role=price]]:flex [&_[data-role=price]]:flex-1 [&_[data-role=price]]:items-baseline [&_[data-role=price]]:justify-end [&_[data-role=price]]:oldstyle-nums [&_[data-role=price]]:before:mx-1.5 [&_[data-role=price]]:before:min-w-3 [&_[data-role=price]]:before:flex-1 [&_[data-role=price]]:before:border-b [&_[data-role=price]]:before:border-dotted [&_[data-role=price]]:before:border-ink/40 [&_[data-role=price]]:before:content-[''] [&_[data-role=qty]]:text-accent [&_[data-role=qty]]:italic [&_[data-role=tip]]:flex-none [&_[data-role=tip]]:rounded-none [&_[data-role=tip]]:border-transparent [&_[data-role=tip]]:bg-transparent [&_[data-role=tip]]:px-px [&_[data-role=tip]]:py-0 [&_[data-role=tip]]:text-[14px]/[1.3] [&_[data-role=tip]]:text-ink/55 [&_[data-role=tip]]:italic [&_[data-role=tip]]:[border-width:0_0_1px] [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-transparent [&_[data-role=tip][aria-pressed=true]]:text-accent [&_[data-role=tips]]:my-3 [&_[data-role=tips]]:justify-start [&_[data-role=tips]]:gap-4 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-part=total]_[data-role=rule]]:border-ink [&_[data-role=row]]:items-baseline [&_[data-role=row]_span]:oldstyle-nums [&_[data-role=row]>[data-role=label]]:text-[9.5px] [&_[data-role=row]>[data-role=label]]:font-semibold [&_[data-role=row]>[data-role=label]]:tracking-[0.2em] [&_[data-role=row]>[data-role=label]]:uppercase [&_[data-role=grand]]:items-baseline [&_[data-role=grand]]:pt-1 [&_[data-role=grand]]:text-[34px]/none [&_[data-role=grand]]:font-light [&_[data-role=grand]]:italic [&_[data-role=grand]_[data-role=amount]]:oldstyle-nums [&_[data-role=grand]_[data-role=label]]:text-[9.5px] [&_[data-role=grand]_[data-role=label]]:font-semibold [&_[data-role=grand]_[data-role=label]]:tracking-[0.2em] [&_[data-role=grand]_[data-role=label]]:not-italic [&_[data-role=grand]_[data-role=label]]:uppercase"
      >
        <header className="border-b border-ink pb-3">
          <h3
            data-role="heading"
            className="font-display text-[42px]/[0.95] font-light tracking-[-0.02em] first-letter:text-accent first-letter:italic"
          >
            Le reçu
          </h3>
          <p
            data-role="meta"
            className="mt-3 flex justify-between text-[9.5px] font-semibold tracking-[0.2em] uppercase"
          >
            <span>{SHOP.name}</span>
            <span className="text-ink-2">No. {SHOP.number}</span>
          </p>
        </header>
        <p data-role="meta" className="mt-3 text-[12.5px] text-ink-2 italic">
          Breakfast for two at table four, a little before nine.
        </p>
        <div className="mt-2">
          <ReceiptItems />
        </div>
        <div className="mt-3">
          <ReceiptTotal />
        </div>
        <p data-role="meta" className="mt-4 text-[9.5px] tracking-[0.2em] text-ink-2 uppercase">
          {SHOP.street} · {SHOP.city}
        </p>
      </div>
    </article>
  )
}
