interface Plan {
  name: string
  blurb: string
  price: string
  unit: string
  cta: string
  features: string[]
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    blurb: "A side project or a first launch.",
    price: "$0",
    unit: "forever",
    cta: "Start building",
    features: ["3 projects", "Basic analytics", "Community support"],
  },
  {
    name: "Pro",
    blurb: "Teams shipping every week.",
    price: "$24",
    unit: "per seat / month",
    cta: "Start free trial",
    features: [
      "Unlimited projects",
      "Advanced analytics",
      "Priority support",
      "Custom domains",
      "SSO",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    blurb: "Review, compliance and scale.",
    price: "Custom",
    unit: "annual contract",
    cta: "Talk to sales",
    features: ["Everything in Pro", "SAML and SCIM", "99.99% SLA", "Success manager"],
  },
]

function Row({ plan }: { plan: Plan }) {
  const pro = plan.popular === true
  const named = (part: string) => (pro ? { viewTransitionName: `pro-${part}` } : undefined)
  return (
    <li
      style={named("plan")}
      className={`grid grid-cols-[176px_148px_1fr_148px] items-center gap-6 rounded-2xl px-6 ${
        pro
          ? "bg-white py-6 shadow-[0_16px_40px_-16px_rgb(79_70_229/0.35)] ring-2 ring-indigo-500"
          : "bg-white/80 py-4 ring-1 ring-zinc-200"
      }`}
    >
      <div>
        <h3
          style={named("name")}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-950"
        >
          {plan.name}
          {pro && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              Most popular
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{plan.blurb}</p>
      </div>
      <p style={named("price")} className="flex flex-col">
        <span
          className={`font-semibold tracking-tight text-zinc-950 tabular-nums ${pro ? "text-3xl" : "text-2xl"}`}
        >
          {plan.price}
        </span>
        <span className="text-xs text-zinc-500">{plan.unit}</span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className={`rounded-full px-2.5 py-1 text-xs ${
              pro ? "bg-indigo-50 text-indigo-900" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {feature}
          </li>
        ))}
      </ul>
      <button
        type="button"
        style={named("cta")}
        className={`h-10 rounded-lg text-sm font-medium transition-colors ${
          pro
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "text-zinc-950 ring-1 ring-zinc-300 hover:bg-zinc-50"
        }`}
      >
        {plan.cta}
      </button>
    </li>
  )
}

export function PricingCard() {
  return (
    <ul className="flex w-[820px] flex-col gap-3">
      {PLANS.map((plan) => (
        <Row key={plan.name} plan={plan} />
      ))}
    </ul>
  )
}
