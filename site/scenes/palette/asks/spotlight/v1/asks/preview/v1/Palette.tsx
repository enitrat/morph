import { GROUPS, ICONS, usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected, run } = usePalette()
  const group = GROUPS.find((entry) => entry.id === selected?.command.group)
  return (
    <section
      data-object="palette"
      data-layout="spotlight"
      aria-label="Command palette"
      className="w-[430px] [--color-accent:#2563eb] [--color-ink-2:#8b8e96] [--color-ink:#17181c] [--color-on-accent:#ffffff] [--color-paper:#f7f7f9] [--color-rule:#e4e4ea] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[22px] bg-paper font-body text-[13.5px]/[1.3] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_0_rgb(255_255_255/0.7)_inset,0_40px_80px_-24px_rgb(0_0_0/0.85)] [&_[data-part=results]_[data-role=icon]]:size-7 [&_[data-part=results]_[data-role=icon]]:rounded-[8px] [&_[data-part=results]_[data-role=icon]]:bg-white [&_[data-part=results]_[data-role=icon]]:p-[6px] [&_[data-part=results]_[data-role=icon]]:text-ink [&_[data-part=results]_[data-role=icon]]:shadow-[inset_0_0_0_1px_var(--color-rule),0_1px_2px_rgb(0_0_0/0.06)] [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:px-0 [&_[data-part=results]_[data-role=keys]]:gap-[2px] [&_[data-part=search]]:gap-3 [&_[data-part=search]_[data-role=icon]]:size-[22px] [&_[data-part=search]_[data-role=icon]]:stroke-[2.25] [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=group]]:px-3 [&_[data-role=group]]:pt-2.5 [&_[data-role=group]]:font-semibold [&_[data-role=input]]:text-[24px] [&_[data-role=input]]:tracking-[-0.015em] [&_[data-role=input]]:placeholder:text-ink-2/60 [&_[data-role=name]]:font-medium [&_[data-role=row]]:gap-3 [&_[data-role=row]]:rounded-[10px] [&_[data-role=row]]:px-2.5 [&_[data-role=row]]:py-[5px] [&_[data-role=row][aria-selected=true]]:bg-accent [&_[data-role=row][aria-selected=true]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:bg-on-accent/15 [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:shadow-none [&_[data-role=row][aria-selected=true]_[data-role=key]]:text-on-accent/80"
      >
        <div className="px-5 pt-[18px] pb-4">
          <PaletteSearch />
        </div>
        <div
          data-role="list"
          className="min-h-0 flex-1 overflow-y-auto border-t border-rule px-2 pb-2"
        >
          <PaletteResults />
        </div>
        <div className="flex items-center gap-3.5 border-t border-rule bg-white/70 px-5 py-3.5">
          <span className="grid size-11 flex-none place-items-center rounded-[12px] bg-accent text-on-accent">
            <svg
              viewBox="0 0 24 24"
              className="size-[22px] fill-none stroke-current stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
              aria-hidden
            >
              <path d={ICONS[selected?.command.icon ?? "search"]} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p
              data-role="meta"
              className="text-[10.5px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
            >
              {group?.name ?? "No match"}
            </p>
            <p data-role="heading" className="truncate text-[15px]/[1.25] font-semibold">
              {selected?.command.name ?? "Nothing to run"}
            </p>
            <p className="truncate text-[12px] text-ink-2">
              {selected?.command.detail ?? "Try fewer letters"}
            </p>
          </div>
          <button
            type="button"
            disabled={selected === null}
            onClick={() => {
              if (selected) run(selected.command.id)
            }}
            className="flex flex-none items-center gap-1.5 rounded-[9px] bg-ink px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-40"
          >
            Run <span className="text-paper/60">↵</span>
          </button>
        </div>
        <div className="border-t border-rule px-5 py-2.5 text-[11px] [&_[data-role=key]]:border-0 [&_[data-role=key]]:bg-ink/[0.06]">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
