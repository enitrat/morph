import { type ReactNode } from "react"

export function Badge({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-(--badge-radius) bg-(--badge-bg) px-(--badge-px) py-0.5 text-xs font-medium text-(--badge-fg)">
      {children}
    </span>
  )
}
