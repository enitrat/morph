import { PlanTable } from "./PlanTable"

export function PricingCard() {
  return (
    <article className="w-[820px] rounded-2xl bg-white px-7 pt-6 pb-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12)] ring-1 ring-zinc-200 [view-transition-name:pro-plan]">
      <PlanTable />
    </article>
  )
}
