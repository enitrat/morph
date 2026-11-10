import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  return (
    <section
      data-object="palette"
      data-layout="tiles"
      aria-label="Command palette"
      className="w-[430px] [--color-accent:#2563eb] [--color-ink-2:#8b8e96] [--color-ink:#17181c] [--color-on-accent:#ffffff] [--color-paper:#f7f7f9] [--color-rule:#e4e4ea] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[22px] bg-paper font-body text-[12.5px]/[1.25] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_40px_80px_-24px_rgb(0_0_0/0.85)] [&_[data-part=results]]:grid-cols-3 [&_[data-part=results]]:gap-2 [&_[data-part=results]_[data-role=icon]]:size-5 [&_[data-part=results]_[data-role=icon]]:text-ink [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:px-0 [&_[data-part=results]_[data-role=key]]:text-[10.5px] [&_[data-part=results]_[data-role=keys]]:gap-px [&_[data-part=search]]:gap-3 [&_[data-part=search]_[data-role=icon]]:size-[22px] [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=empty]]:col-span-3 [&_[data-role=group]]:hidden [&_[data-role=input]]:text-[22px] [&_[data-role=input]]:tracking-[-0.015em] [&_[data-role=name]]:font-medium [&_[data-role=name]]:text-balance [&_[data-role=name]]:whitespace-normal [&_[data-role=row]]:h-[96px] [&_[data-role=row]]:flex-col [&_[data-role=row]]:items-start [&_[data-role=row]]:gap-2.5 [&_[data-role=row]]:rounded-[14px] [&_[data-role=row]]:bg-ink/[0.045] [&_[data-role=row]]:p-3 [&_[data-role=row]]:transition-colors [&_[data-role=row][aria-selected=true]]:bg-accent [&_[data-role=row][aria-selected=true]]:text-on-accent [&_[data-role=row][aria-selected=true]]:shadow-[0_10px_20px_-10px_var(--color-accent)] [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=key]]:text-on-accent/75 [&_[data-role=section]]:contents"
      >
        <div className="px-5 pt-[18px] pb-4">
          <PaletteSearch />
        </div>
        <div
          data-role="list"
          className="min-h-0 flex-1 overflow-y-auto border-t border-rule px-3 pt-3 pb-3"
        >
          <PaletteResults />
        </div>
        <div className="border-t border-rule px-5 py-2.5 text-[11px]">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
