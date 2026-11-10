import { SHOP } from "./data"
import { ReceiptItems } from "./ReceiptItems"
import { ReceiptTotal } from "./ReceiptTotal"

export function Receipt() {
  return (
    <article
      data-object="receipt"
      data-layout="menu"
      className="w-[280px] -rotate-[0.6deg] [--color-accent:#7a1f1f] [--color-ink-2:#6f675c] [--color-ink:#1d1a16] [--color-on-accent:#f4efe4] [--color-paper:#f4efe4] [--color-rule:#cdc3b1] [--font-body:var(--font-editorial)] [--font-display:var(--font-editorial)] [--font-num:var(--font-editorial)]"
    >
      <div
        data-role="paper"
        className="bg-paper px-6 pt-[26px] pb-6 text-center font-body text-[13px]/[1.5] text-ink shadow-[0_30px_60px_-26px_rgb(0_0_0/0.75),0_1px_3px_rgb(0_0_0/0.25)] [&_[data-role=group]]:mt-3 [&_[data-role=group]]:mb-1 [&_[data-role=group]]:text-center [&_[data-role=group]]:text-[9.5px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.2em] [&_[data-role=group]]:text-accent [&_[data-role=group]]:uppercase [&_[data-role=line]]:gap-0 [&_[data-role=line]]:text-left [&_[data-role=line]]:text-[14px]/[1.75] [&_[data-role=name]]:flex-initial [&_[data-role=price]]:flex [&_[data-role=price]]:flex-1 [&_[data-role=price]]:items-baseline [&_[data-role=price]]:justify-end [&_[data-role=price]]:oldstyle-nums [&_[data-role=price]]:before:mx-1.5 [&_[data-role=price]]:before:min-w-3 [&_[data-role=price]]:before:flex-1 [&_[data-role=price]]:before:border-b [&_[data-role=price]]:before:border-dotted [&_[data-role=price]]:before:border-ink/45 [&_[data-role=price]]:before:content-[''] [&_[data-role=qty]]:text-ink-2 [&_[data-role=qty]]:italic [&_[data-role=tip]]:flex-none [&_[data-role=tip]]:rounded-none [&_[data-role=tip]]:border-transparent [&_[data-role=tip]]:bg-transparent [&_[data-role=tip]]:px-px [&_[data-role=tip]]:py-0 [&_[data-role=tip]]:text-[14px]/[1.3] [&_[data-role=tip]]:text-ink/60 [&_[data-role=tip]]:italic [&_[data-role=tip]]:[border-width:0_0_1px] [&_[data-role=tip][aria-pressed=true]]:border-accent [&_[data-role=tip][aria-pressed=true]]:bg-transparent [&_[data-role=tip][aria-pressed=true]]:text-accent [&_[data-role=tips]]:my-3 [&_[data-role=tips]]:justify-center [&_[data-role=tips]]:gap-3.5 [&_[data-part=total]_[data-role=rule]]:hidden [&_[data-role=row]]:items-baseline [&_[data-role=row]_span]:oldstyle-nums [&_[data-role=row]>[data-role=label]]:text-[9.5px] [&_[data-role=row]>[data-role=label]]:font-semibold [&_[data-role=row]>[data-role=label]]:tracking-[0.2em] [&_[data-role=row]>[data-role=label]]:uppercase [&_[data-role=grand]]:items-baseline [&_[data-role=grand]]:justify-center [&_[data-role=grand]]:gap-3 [&_[data-role=grand]]:text-[34px]/none [&_[data-role=grand]]:font-light [&_[data-role=grand]]:italic [&_[data-role=grand]_[data-role=amount]]:oldstyle-nums [&_[data-role=grand]_[data-role=label]]:text-[9.5px] [&_[data-role=grand]_[data-role=label]]:font-semibold [&_[data-role=grand]_[data-role=label]]:tracking-[0.2em] [&_[data-role=grand]_[data-role=label]]:not-italic [&_[data-role=grand]_[data-role=label]]:uppercase"
      >
        <header>
          <p data-role="meta" className="text-[9.5px] font-semibold tracking-[0.2em] uppercase">
            {SHOP.name} · Table four
          </p>
          <h3 data-role="heading" className="mt-3 font-display text-[30px]/none italic">
            Le reçu
          </h3>
          <p className="mt-1.5 mb-2 text-[14px] tracking-[0.4em] text-accent" aria-hidden>
            ✦ ✦ ✦
          </p>
          <p data-role="meta" className="text-[9.5px] tracking-[0.2em] text-ink-2 uppercase">
            The fourteenth of November
          </p>
        </header>
        <p className="mt-5 mb-1 text-[9.5px] font-semibold tracking-[0.2em] text-accent uppercase">
          À la carte
        </p>
        <ReceiptItems />
        <hr data-role="rule" className="mx-auto my-3.5 w-10 border-0 border-t border-accent" />
        <ReceiptTotal />
        <p data-role="meta" className="mt-4 text-[12px] text-ink-2 italic">
          Merci, et à bientôt.
        </p>
      </div>
    </article>
  )
}
