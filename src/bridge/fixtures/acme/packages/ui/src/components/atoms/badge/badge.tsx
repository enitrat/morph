export function Badge({ children }: { children?: unknown }) {
  return (
    <span className="rounded-(--badge-radius) bg-(--badge-bg) px-(--badge-px) text-(--badge-fg)">
      {children}
    </span>
  )
}
