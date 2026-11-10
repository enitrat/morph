import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

function Hero() {
  return (
    <section className="grid grid-cols-2 items-center gap-12 pt-22 pb-18">
      <div className="flex flex-col items-start gap-6">
        <Badge className="border-[#fbd5bd] bg-[#fff1e8] px-[10px] text-[#b8460a]">
          New · Workflows 2.0
        </Badge>
        <h1 className="text-6xl font-semibold tracking-tight text-foreground">
          Ship the work, skip the busywork.
        </h1>
        <p className="text-lg text-muted-foreground">
          Acme turns your team's recurring tasks into calm, reliable workflows that run themselves.
        </p>
        <div className="flex gap-3">
          <Button size="lg">Start for free</Button>
          <Button size="lg" variant="outline">
            Book a demo
          </Button>
        </div>
      </div>
      <div className="h-80 rounded-xl bg-secondary p-8">
        <div className="flex h-full flex-col gap-3 rounded-lg bg-card p-6">
          <i className="h-3 w-1/2 rounded-full bg-muted" />
          <i className="h-3 w-3/4 rounded-full bg-muted" />
          <i className="h-3 w-2/3 rounded-full bg-muted" />
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-4xl font-semibold tracking-tight text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Card className="gap-3">
      <span className="mx-6 grid size-9 place-items-center rounded-md bg-secondary text-lg">
        {icon}
      </span>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
    </Card>
  )
}

function PricingCard({
  plan,
  price,
  features,
  featured = false,
}: {
  plan: string
  price: string
  features: string[]
  featured?: boolean
}) {
  return (
    <Card className={featured ? "border-2 border-foreground" : ""}>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-lg">{plan}</CardTitle>
        {featured && (
          <Badge className="border-[#fbd5bd] bg-[#fff1e8] px-[10px] text-[#b8460a]">Popular</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-4xl font-semibold text-foreground">
          {price}
          <span className="text-sm font-normal text-muted-foreground">/month</span>
        </p>
        <ul className="flex flex-col gap-3 text-sm text-foreground">
          {features.map((feature) => (
            <li key={feature}>✓ {feature}</li>
          ))}
        </ul>
        <Button variant={featured ? "default" : "outline"}>Choose {plan}</Button>
      </CardContent>
    </Card>
  )
}

/** A marketing page built from the shared components, for driving Morph against real tokens. */
export function Tour() {
  return (
    <main className="mx-auto flex max-w-264 flex-col gap-24 px-6 pb-32">
      <nav className="flex items-center gap-8 pt-6 text-sm text-muted-foreground">
        <b className="text-xl text-foreground">Acme</b>
        <span>Product</span>
        <span>Customers</span>
        <span>Pricing</span>
      </nav>
      <Hero />
      <div className="grid grid-cols-4 gap-6">
        <Stat value="12k+" label="teams" />
        <Stat value="4.2M" label="runs a week" />
        <Stat value="99.98%" label="uptime" />
        <Stat value="38 min" label="saved per person, daily" />
      </div>
      <section className="flex flex-col gap-8">
        <h2 className="text-4xl font-semibold tracking-tight text-foreground">
          Everything runs on rails
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <FeatureCard
            icon="⚡"
            title="Triggers"
            body="Start a workflow from any event, schedule or webhook."
          />
          <FeatureCard
            icon="🧩"
            title="Steps"
            body="Compose actions across 300+ integrations without code."
          />
          <FeatureCard
            icon="📈"
            title="Insights"
            body="See every run, every retry, every minute."
          />
        </div>
      </section>
      <section className="flex flex-col gap-8">
        <h2 className="text-4xl font-semibold tracking-tight text-foreground">Simple pricing</h2>
        <div className="grid grid-cols-3 gap-4">
          <PricingCard
            plan="Starter"
            price="$0"
            features={["3 workflows", "1k runs / month", "Community support"]}
          />
          <PricingCard
            plan="Team"
            price="$24"
            features={["Unlimited workflows", "50k runs / month", "Priority support"]}
            featured
          />
          <PricingCard
            plan="Enterprise"
            price="$89"
            features={["Everything in Team", "Audit log", "Dedicated CSM"]}
          />
        </div>
      </section>
    </main>
  )
}
