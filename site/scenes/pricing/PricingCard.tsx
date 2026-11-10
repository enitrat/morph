const FEATURES = [
  "Unlimited projects",
  "Advanced analytics",
  "Priority support",
  "Custom domains",
  "SSO and audit log",
]

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mt-0.5 size-4 shrink-0 text-indigo-600">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PricingCard() {
  return (
    <article className="flex w-80 flex-col rounded-2xl bg-white p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)] ring-1 ring-zinc-200 [view-transition-name:pro-plan]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-950 [view-transition-name:pro-name]">Pro</h3>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          14 days free
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">For teams shipping every week.</p>
      <p className="mt-6 flex items-baseline gap-1 [view-transition-name:pro-price]">
        <span className="text-5xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          $24
        </span>
        <span className="text-sm text-zinc-500">per seat / month</span>
      </p>
      <button
        type="button"
        className="mt-6 h-10 rounded-lg bg-zinc-950 text-sm font-medium text-white transition-colors hover:bg-zinc-800 [view-transition-name:pro-cta]"
      >
        Start free trial
      </button>
      <ul className="mt-7 flex flex-col gap-3 border-t border-zinc-100 pt-6 text-sm text-zinc-700">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  )
}
