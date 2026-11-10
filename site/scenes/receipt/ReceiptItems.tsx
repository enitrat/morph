import { ITEMS, lineTotal, money } from "./data"

export function ReceiptItems() {
  return (
    <ul data-part="items" className="grid gap-0.5">
      {ITEMS.map((item) => (
        <li key={item.name} data-role="line" className="flex items-baseline gap-2">
          <span data-role="name" className="min-w-0 flex-1">
            {item.qty > 1 && <span data-role="qty">{item.qty}× </span>}
            {item.name}
          </span>
          <span data-role="price" className="font-num tabular-nums">
            {money(lineTotal(item))}
          </span>
        </li>
      ))}
    </ul>
  )
}
