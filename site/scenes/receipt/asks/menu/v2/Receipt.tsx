import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="menu"
      className="w-[290px] rotate-[0.7deg] [--color-accent:#d8b46a] [--color-ink-2:#b9c2b4] [--color-ink:#f4efe4] [--color-on-accent:#1f3a2e] [--color-paper:#1f3a2e] [--color-rule:#5d6f55] [--font-body:var(--font-editorial)] [--font-display:var(--font-editorial)] [--font-num:var(--font-editorial)]"
    >
      <div
        data-role="paper"
        className="bg-paper p-2.5 text-center font-body text-[13px]/[1.5] text-ink shadow-[0_30px_60px_-26px_rgb(0_0_0/0.8),0_1px_3px_rgb(0_0_0/0.3)] [&_[data-role=group]]:mt-3 [&_[data-role=group]]:mb-1 [&_[data-role=group]]:text-center [&_[data-role=group]]:text-[9.5px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.22em] [&_[data-role=group]]:text-accent [&_[data-role=group]]:uppercase [&_[data-role=line]]:gap-0 [&_[data-role=line]]:text-left [&_[data-role=line]]:text-[13.5px]/[1.8] [&_[data-role=name]]:flex-initial [&_[data-role=price]]:flex [&_[data-role=price]]:flex-1 [&_[data-role=price]]:items-baseline [&_[data-role=price]]:justify-end [&_[data-role=price]]:oldstyle-nums [&_[data-role=price]]:before:mx-1.5 [&_[data-role=price]]:before:min-w-3 [&_[data-role=price]]:before:flex-1 [&_[data-role=price]]:before:border-b [&_[data-role=price]]:before:border-dotted [&_[data-role=price]]:before:border-accent/55 [&_[data-role=price]]:before:content-[''] [&_[data-role=qty]]:text-accent [&_[data-role=qty]]:italic [&_[data-role=tip]]:flex-none [&_[data-role=tip]]:rounded-none [&_[data-role=tip]]:border-transparent [&_[data-role=tip]]:bg-transparent [&_[data-role=tip]]:px-px [&_[data-role=tip]]:py-0 [&_[data-role=tip]]:text-[14px]/[1.3] [&_[data-role=tip]]:text-ink/60 [&_[data-role=tip]]:italic [&_[data-role=tip]]:[border-width:0_0_1px] [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-transparent [&_[data-role=tip][aria-pressed=true]]:text-accent [&_[data-role=tips]]:my-3 [&_[data-role=tips]]:justify-center [&_[data-role=tips]]:gap-3.5 [&_[data-part=total]_[data-role=rule]]:mx-auto [&_[data-part=total]_[data-role=rule]]:w-16 [&_[data-part=total]_[data-role=rule]]:border-solid [&_[data-part=total]_[data-role=rule]]:border-accent/60 [&_[data-role=row]]:items-baseline [&_[data-role=row]_span]:oldstyle-nums [&_[data-role=row]>[data-role=label]]:italic [&_[data-role=row]>[data-role=label]]:text-ink-2 [&_[data-role=grand]]:flex-col [&_[data-role=grand]]:items-center [&_[data-role=grand]]:gap-2 [&_[data-role=grand]]:pt-1 [&_[data-role=grand]]:text-[38px]/none [&_[data-role=grand]]:font-normal [&_[data-role=grand]_[data-role=amount]]:oldstyle-nums [&_[data-role=grand]_[data-role=label]]:text-[9.5px] [&_[data-role=grand]_[data-role=label]]:font-semibold [&_[data-role=grand]_[data-role=label]]:tracking-[0.22em] [&_[data-role=grand]_[data-role=label]]:uppercase"
      >
        <div className="border border-accent/50 px-[18px] pt-6 pb-5 outline outline-accent/25 outline-offset-[3px]">
          <header>
            <p
              data-role="meta"
              className="text-[9.5px] font-semibold tracking-[0.22em] text-accent uppercase"
            >
              L’addition
            </p>
            <h3
              data-role="heading"
              className="mt-2.5 font-display text-[28px]/none font-normal tracking-[0.01em]"
            >
              {SHOP.name}
            </h3>
            <p data-role="meta" className="mt-2 text-[12.5px] text-ink-2 italic">
              Table four, the fourteenth of November
            </p>
            <p
              className="mt-3 flex items-center justify-center gap-2 text-[8px] text-accent"
              aria-hidden
            >
              <span className="h-px w-12 bg-accent/60" />◆
              <span className="h-px w-12 bg-accent/60" />
            </p>
          </header>
          <div className="mt-3">
            <ReceiptItems />
          </div>
          <div className="mt-2">
            <ReceiptTotal />
          </div>
          <p data-role="meta" className="mt-4 text-[9.5px] tracking-[0.22em] text-ink-2 uppercase">
            {SHOP.street} · {SHOP.city}
          </p>
        </div>
      </div>
    </article>
  )
}
