import { Button } from "../../atoms/button/button"
import { Card } from "../../molecules/card/card"

export function OrderSummary({ total }: { total: string }) {
  return (
    <Card title="Order">
      <div className="flex flex-col gap-(--order-summary-gap)">
        <p className="text-(--order-summary-total-fg)">{total}</p>
        <Button variant="secondary">Check out</Button>
      </div>
    </Card>
  )
}
