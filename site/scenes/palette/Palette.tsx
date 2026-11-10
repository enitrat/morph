import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  return (
    <section
      data-object="palette"
      data-layout="dialog"
      aria-label="Command palette"
      className="w-[420px] rotate-[0.8deg] [--color-accent:#2f5bd3] [--color-ink-2:#878a92] [--color-ink:#1b1d22] [--color-on-accent:#ffffff] [--color-paper:#fdfdfc] [--color-rule:#e6e4df] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[14px] bg-paper font-body text-[13.5px]/[1.3] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_60px_-20px_rgb(0_0_0/0.7)]"
      >
        <div className="border-b border-rule px-4 py-3.5 text-[15px]">
          <PaletteSearch />
        </div>
        <div data-role="list" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <PaletteResults />
        </div>
        <div className="border-t border-rule bg-ink/[0.015] px-3.5 py-2.5">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
