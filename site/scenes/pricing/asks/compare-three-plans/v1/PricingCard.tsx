interface Plan {
  name: string
  blurb: string
  price: string
  unit: string
  cta: string
  features: string[]
}

const STARTER: Plan = {
  name: "Starter",
  blurb: "For a side project or a first launch.",
  price: "$0",
  unit: "forever",
  cta: "Start building",
  features: ["3 projects", "Basic analytics", "Community support"],
}

const PRO: Plan = {
  name: "Pro",
  blurb: "For teams shipping every week.",
  price: "$24",
  unit: "per seat / month",
  cta: "Start free trial",
  features: [
    "Unlimited projects",
    "Advanced analytics",
    "Priority support",
    "Custom domains",
    "SSO and audit log",
  ],
}

const ENTERPRISE: Plan = {
  name: "Enterprise",
  blurb: "For organizations with review and compliance.",
  price: "Custom",
  unit: "annual contract",
  cta: "Talk to sales",
  features: [
    "Everything in Pro",
    "SAML and SCIM",
    "99.99% uptime SLA",
    "Dedicated success manager",
  ],
}

function Check({ tone }: { tone: "plain" | "inverse" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`mt-0.5 size-4 shrink-0 ${tone === "inverse" ? "text-indigo-300" : "text-zinc-400"}`}
    >
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

function SideColumn({ plan }: { plan: Plan }) {
  return (
    <article className="flex w-64 flex-col rounded-2xl bg-white p-6 ring-1 ring-zinc-200">
      <h3 className="text-sm font-semibold text-zinc-950">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-sm text-zinc-500">{plan.blurb}</p>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          {plan.price}
        </span>
        <span className="text-xs text-zinc-500">{plan.unit}</span>
      </p>
      <button
        type="button"
        className="mt-5 h-9 rounded-lg bg-white text-sm font-medium text-zinc-950 ring-1 ring-zinc-300 transition-colors hover:bg-zinc-50"
      >
        {plan.cta}
      </button>
      <ul className="mt-6 flex flex-col gap-2.5 text-sm text-zinc-600">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check tone="plain" />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  )
}

export function PricingCard() {
  return (
    <div className="flex items-center gap-4">
      <SideColumn plan={STARTER} />
      <article className="relative flex w-72 flex-col rounded-2xl bg-zinc-950 p-7 text-white shadow-[0_24px_48px_-16px_rgb(49_46_129/0.45)] ring-1 ring-zinc-800 [view-transition-name:pro-plan]">
        <span className="absolute -top-3 left-7 rounded-full bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white uppercase shadow-sm">
          Most popular
        </span>
        <h3 className="text-sm font-semibold [view-transition-name:pro-name]">{PRO.name}</h3>
        <p className="mt-1 min-h-10 text-sm text-zinc-400">{PRO.blurb}</p>
        <p className="mt-5 flex items-baseline gap-1 [view-transition-name:pro-price]">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">{PRO.price}</span>
          <span className="text-xs text-zinc-400">{PRO.unit}</span>
        </p>
        <button
          type="button"
          className="mt-6 h-10 rounded-lg bg-white text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 [view-transition-name:pro-cta]"
        >
          {PRO.cta}
        </button>
        <ul className="mt-6 flex flex-col gap-2.5 text-sm text-zinc-200">
          {PRO.features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check tone="inverse" />
              {feature}
            </li>
          ))}
        </ul>
      </article>
      <SideColumn plan={ENTERPRISE} />
    </div>
  )
}
