import type { ReactElement } from "react"
import { ITEMS, lineTotal, money } from "./data"

/** Each item drawn flat on a 40 × 40 grid in the object's own inks, so a table style recolours it. */
const ART: Record<string, ReactElement> = {
  "Flat white": (
    <>
      <path
        d="M15 6.5c-1.4 1.6 1.4 2.9 0 4.5M20 5c-1.4 1.6 1.4 2.9 0 4.5M25 6.5c-1.4 1.6 1.4 2.9 0 4.5"
        className="fill-none stroke-ink-2"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <rect x="6" y="30" width="28" height="3" rx="1.5" className="fill-ink-2" />
      <path
        d="M28 17.5h1.6a3.4 3.4 0 0 1 0 6.8H27"
        className="fill-none stroke-ink"
        strokeWidth={2}
      />
      <path d="M10 15h19v5.5c0 5-3.9 9-8.8 9h-1.4c-4.9 0-8.8-4-8.8-9Z" className="fill-ink" />
      <ellipse cx="19.5" cy="15" rx="9.5" ry="1.9" className="fill-paper" />
    </>
  ),
  "Oat cortado": (
    <>
      <ellipse cx="20" cy="33.6" rx="9" ry="1.3" className="fill-ink-2 opacity-40" />
      <path d="M12.56 13.5h14.88l-.25 3.5H12.81Z" className="fill-paper" />
      <path d="M12.81 17h14.38l-.48 7H13.29Z" className="fill-ink-2" />
      <path d="M13.29 24h13.42l-.51 7.2H13.8Z" className="fill-ink" />
      <path
        d="M11.5 9h17l-1.6 23H13.1Z"
        className="fill-none stroke-ink"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </>
  ),
  "Sparkling water": (
    <>
      <rect x="17" y="3" width="6" height="3" rx="1" className="fill-ink-2" />
      <path
        d="M17.5 6h5v3.5c0 2.2 5.5 3.4 5.5 8V32a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V17.5c0-4.6 5.5-5.8 5.5-8Z"
        className="fill-ink"
      />
      <rect x="12" y="20" width="16" height="8" className="fill-paper" />
      <circle cx="16" cy="25" r="1.1" className="fill-ink-2" />
      <circle cx="19.6" cy="22.8" r="1.5" className="fill-ink-2" />
      <circle cx="23.6" cy="25.4" r="0.9" className="fill-ink-2" />
      <circle cx="24.8" cy="22.3" r="0.6" className="fill-ink-2" />
    </>
  ),
  "Cardamom bun": (
    <>
      <rect x="5" y="30" width="30" height="2.6" rx="1.3" className="fill-ink-2" />
      <path d="M7.5 30c0-8.3 5.6-14 12.5-14s12.5 5.7 12.5 14Z" className="fill-ink" />
      <path
        d="M12 28.5c.4-5.4 4.8-8.6 9-7.6 3.6.9 4.8 4.8 2.2 6.6-2.1 1.4-4.6.2-4.4-1.9"
        className="fill-none stroke-paper"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx="15" cy="20.5" r="0.7" className="fill-paper" />
      <circle cx="24.5" cy="19.3" r="0.7" className="fill-paper" />
      <circle cx="28.4" cy="24.4" r="0.7" className="fill-paper" />
      <circle cx="10.8" cy="25.6" r="0.7" className="fill-paper" />
    </>
  ),
  "Sourdough, butter": (
    <>
      <path
        d="M11 31.5V21c-3.4-.6-4.4-4.4-2.4-7.2 2.2-3 6.6-4.3 11.4-4.3s9.2 1.3 11.4 4.3c2 2.8 1 6.6-2.4 7.2v10.5a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5Z"
        className="fill-ink"
      />
      <path
        d="M13.2 30.8V19.6c-2.8-.4-3.4-3-2-4.8 1.8-2.2 5.2-3 8.8-3s7 .8 8.8 3c1.4 1.8.8 4.4-2 4.8v11.2Z"
        className="fill-paper"
      />
      <circle cx="16" cy="17" r="1" className="fill-rule" />
      <circle cx="24.5" cy="27" r="1.1" className="fill-rule" />
      <circle cx="16.6" cy="27.4" r="0.8" className="fill-rule" />
      <circle cx="23.6" cy="15.4" r="0.7" className="fill-rule" />
      <rect
        x="16"
        y="19"
        width="10"
        height="6.5"
        rx="1.2"
        transform="rotate(-10 21 22.25)"
        className="fill-ink-2"
      />
    </>
  ),
}

export function ReceiptItems() {
  return (
    <ul data-part="items" className="grid grid-cols-6 gap-x-1.5 gap-y-2.5">
      {ITEMS.map((item) => (
        <li
          key={item.name}
          data-role="line"
          className={`flex flex-col gap-1 ${item.course === "drinks" ? "col-span-2" : "col-span-3"}`}
        >
          <div
            data-role="photo"
            className="relative grid h-[60px] place-items-center rounded-[6px] bg-rule/30"
          >
            <svg viewBox="0 0 40 40" aria-hidden className="size-12">
              {ART[item.name]}
            </svg>
            {item.qty > 1 && (
              <span
                data-role="qty"
                className="absolute top-1 right-1 rounded-full bg-ink px-1.5 py-px font-num text-[9.5px] text-paper tabular-nums"
              >
                {item.qty}×
              </span>
            )}
          </div>
          <span data-role="name" className="flex-1 px-0.5 text-[10.5px]/[1.3]">
            {item.name}
          </span>
          <span
            data-role="price"
            className="px-0.5 font-num text-[11px]/none font-bold tabular-nums"
          >
            {money(lineTotal(item))}
          </span>
        </li>
      ))}
    </ul>
  )
}
