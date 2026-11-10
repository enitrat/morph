import { ICONS, usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected, run } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="spotlight"
      aria-label="Command palette"
      className="w-[430px] [--color-accent:#2563eb] [--color-ink-2:#8b8e96] [--color-ink:#17181c] [--color-on-accent:#ffffff] [--color-paper:#f7f7f9] [--color-rule:#e4e4ea] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[22px] bg-paper font-body text-[13px]/[1.3] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_40px_80px_-24px_rgb(0_0_0/0.85)] [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:px-0 [&_[data-part=search]]:gap-3 [&_[data-part=search]_[data-role=icon]]:size-[22px] [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=group]]:px-3 [&_[data-role=group]]:pt-2.5 [&_[data-role=group]]:text-[10.5px] [&_[data-role=group]]:font-semibold [&_[data-role=group]]:tracking-[0.06em] [&_[data-role=group]]:uppercase [&_[data-role=input]]:text-[22px] [&_[data-role=input]]:tracking-[-0.015em] [&_[data-role=row]]:rounded-[9px] [&_[data-role=row]]:px-3 [&_[data-role=row]]:py-[5px] [&_[data-role=row][aria-selected=true]]:bg-accent/8 [&_[data-role=row][aria-selected=true]]:text-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-accent"
      >
        <div className="px-5 pt-[18px] pb-3.5">
          <PaletteSearch />
        </div>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => {
            if (selected) run(selected.command.id)
          }}
          className="group mx-2.5 flex items-center gap-3.5 rounded-[16px] bg-accent/8 p-3.5 text-left disabled:opacity-50"
        >
          <span className="grid size-12 flex-none place-items-center rounded-[13px] bg-accent text-on-accent shadow-[0_6px_14px_-6px_var(--color-accent)]">
            <svg
              viewBox="0 0 24 24"
              className="size-6 fill-none stroke-current stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
              aria-hidden
            >
              <path d={ICONS[selected?.command.icon ?? "search"]} />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span
              data-role="meta"
              className="block text-[10.5px] font-semibold tracking-[0.06em] text-accent uppercase"
            >
              Top hit
            </span>
            <span
              data-role="heading"
              className="mt-0.5 block truncate text-[17px]/[1.2] font-semibold"
            >
              {selected?.command.name ?? "Nothing matches"}
            </span>
            <span className="block truncate text-[12px] text-ink-2">
              {selected?.command.detail ?? "Try fewer letters"}
            </span>
          </span>
          <span className="flex flex-none flex-col items-end gap-1.5">
            <span className="flex gap-[3px]">
              {selected?.command.keys.map((key) => (
                <kbd
                  key={key}
                  className="grid h-[22px] min-w-[22px] place-items-center rounded-[6px] bg-paper px-1.5 font-body text-[11.5px] text-ink shadow-[0_1px_0_var(--color-rule),inset_0_0_0_1px_var(--color-rule)]"
                >
                  {key}
                </kbd>
              ))}
            </span>
            <span className="text-[10.5px] text-ink-2 group-hover:text-accent">↵ Run</span>
          </span>
        </button>
        <div data-role="list" className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <PaletteResults />
        </div>
        <div className="border-t border-rule px-5 py-2.5 text-[11px]">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
