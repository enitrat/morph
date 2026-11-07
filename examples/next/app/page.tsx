import { type ReactNode } from "react"

import { Badge, Button, Card, OrderSummary } from "acme"

import { ThemeToggle } from "./theme-toggle"

const VARIANTS = ["primary", "secondary", "outline", "ghost", "destructive"] as const
const SIZES = ["sm", "md", "lg"] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

export default function Page() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Acme</h1>
        <ThemeToggle />
      </header>

      <Section title="Button">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {`${variant} ${size}`}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex gap-3">
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex gap-3">
          <Badge>New</Badge>
          <Badge>Beta</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card title="Summary">
          <p className="text-sm">Three items ship on Monday.</p>
        </Card>
      </Section>

      <Section title="Order summary">
        <OrderSummary total="$42.00" />
      </Section>
    </main>
  )
}
