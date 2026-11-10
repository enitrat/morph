import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { matches, selected } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="crt"
      aria-label="Command palette"
      className="w-[420px] [--color-accent:#7dff9a] [--color-ink-2:#2f8a4c] [--color-ink:#7dff9a] [--color-on-accent:#03130a] [--color-paper:#03130a] [--color-rule:#0f3a1f] [--font-body:var(--font-thermal)] [--font-display:var(--font-thermal)] [--font-num:var(--font-thermal)]"
    >
      <div className="rounded-[30px] bg-[linear-gradient(#2a2b2e,#151618)] p-[14px] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_30px_60px_-20px_rgb(0_0_0/0.9)]">
        <div
          data-role="paper"
          className="relative flex h-[420px] flex-col overflow-hidden rounded-[20px] bg-paper px-4 pt-4 pb-3 font-body text-[12px]/[1.55] text-ink uppercase shadow-[inset_0_0_50px_rgb(0_0_0/0.85)] [text-shadow:0_0_6px_rgb(125_255_154/0.45)] [&_[data-part=results]]:grid-cols-2 [&_[data-part=results]]:gap-x-3 [&_[data-part=results]_[data-role=icon]]:hidden [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:p-0 [&_[data-part=results]_[data-role=key]]:text-[10px] [&_[data-part=results]_[data-role=key]]:text-ink-2 [&_[data-part=results]_[data-role=keys]]:gap-0 [&_[data-part=search]]:gap-2 [&_[data-part=search]_[data-role=icon]]:hidden [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=detail]]:hidden [&_[data-role=empty]]:col-span-2 [&_[data-role=empty]]:p-0 [&_[data-role=empty]]:text-left [&_[data-role=empty]]:text-[12px] [&_[data-role=ghost]]:text-ink-2 [&_[data-role=group]]:hidden [&_[data-role=hit]]:bg-ink [&_[data-role=hit]]:font-normal [&_[data-role=hit]]:text-paper [&_[data-role=hit]]:no-underline [&_[data-role=hit]]:[text-shadow:none] [&_[data-role=input]]:uppercase [&_[data-role=input]]:caret-ink [&_[data-role=input]]:placeholder:text-ink-2 [&_[data-role=row]]:gap-2 [&_[data-role=row]]:rounded-none [&_[data-role=row]]:px-1.5 [&_[data-role=row]]:py-[3px] [&_[data-role=row][aria-selected=true]]:bg-ink [&_[data-role=row][aria-selected=true]]:text-paper [&_[data-role=row][aria-selected=true]]:[text-shadow:none] [&_[data-role=row][aria-selected=true]_[data-role=hit]]:bg-paper [&_[data-role=row][aria-selected=true]_[data-role=hit]]:text-ink [&_[data-role=row][aria-selected=true]_[data-role=key]]:text-paper [&_[data-role=section]]:contents [&_[data-role=scope]]:rounded-none [&_[data-role=scope]]:border-ink-2 [&_[data-role=scope]]:py-0.5 [&_[data-role=pick]_svg]:hidden [&_[data-role=pick]]:rounded-none [&_[data-role=pick]]:border-ink-2 [&_[data-role=pick]]:px-2"
        >
          <p data-role="heading" className="text-ink-2">
            Studio OS 2.6 · 64K RAM SYSTEM
          </p>
          <p data-role="meta" className="text-ink-2">
            Ready.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <span className="flex-none">&gt;</span>
            <div className="min-w-0 flex-1">
              <PaletteSearch />
            </div>
          </div>
          <p data-role="meta" className="mt-3 mb-1 text-ink-2">
            {matches.length} match{matches.length === 1 ? "" : "es"}
            {selected ? ` · ${selected.command.keys.join("")} runs it` : ""}
          </p>
          <div data-role="list" className="min-h-0 flex-1 overflow-y-auto">
            <PaletteResults />
          </div>
          <div className="mt-2 border-t border-dashed border-rule pt-2 text-[10.5px] [&_[data-role=key]]:border-ink-2 [&_[data-role=key]]:text-ink [&_[data-role=legend]:nth-child(3)]:hidden">
            <PaletteFooter />
          </div>
          <div
            aria-hidden
            data-role="scanlines"
            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(transparent_0_2px,rgb(0_0_0/0.28)_2px_3px)]"
          />
        </div>
      </div>
    </section>
  )
}
