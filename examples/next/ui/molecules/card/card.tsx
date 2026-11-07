import { type ReactNode } from "react"

export function Card({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-(--card-radius) border border-(--card-border) bg-(--card-bg) p-(--card-pad) text-(--card-fg)">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
