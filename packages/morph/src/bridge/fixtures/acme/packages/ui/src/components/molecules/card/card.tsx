export function Card({ title, children }: { title: string; children?: unknown }) {
  return (
    <section className="rounded-(--card-radius) border border-(--card-border) bg-(--card-bg) p-(--card-pad) text-(--card-fg)">
      <h2 className="text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
