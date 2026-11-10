import { GROUPS, ICONS, usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected, runs, run } = usePalette()
  const group = GROUPS.find((entry) => entry.id === selected?.command.group)
  const uses = selected ? runs.get(selected.command.id) : undefined
  return (
    <section
      data-object="palette"
      data-layout="spotlight"
      aria-label="Command palette"
      className="w-[430px] [--color-accent:#2563eb] [--color-ink-2:#8b8e96] [--color-ink:#17181c] [--color-on-accent:#ffffff] [--color-paper:#f7f7f9] [--color-rule:#e4e4ea] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[22px] bg-paper font-body text-[13px]/[1.3] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_0_rgb(255_255_255/0.7)_inset,0_40px_80px_-24px_rgb(0_0_0/0.85)] [&_[data-part=results]_[data-role=icon]]:size-[15px] [&_[data-part=search]]:gap-3 [&_[data-part=search]_[data-role=icon]]:size-[22px] [&_[data-part=search]_[data-role=icon]]:stroke-[2.25] [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=group]]:px-2.5 [&_[data-role=group]]:pt-2.5 [&_[data-role=group]]:font-semibold [&_[data-role=input]]:text-[22px] [&_[data-role=input]]:tracking-[-0.015em] [&_[data-role=input]]:placeholder:text-ink-2/60 [&_[data-role=keys]]:hidden [&_[data-role=row]]:gap-2.5 [&_[data-role=row]]:rounded-[9px] [&_[data-role=row]]:px-2.5 [&_[data-role=row]]:py-[5px] [&_[data-role=row][aria-selected=true]]:bg-accent [&_[data-role=row][aria-selected=true]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-on-accent [&_[data-role=uses]]:hidden"
      >
        <div className="px-5 pt-[18px] pb-4">
          <PaletteSearch />
        </div>
        <div className="flex min-h-0 flex-1 border-t border-rule">
          <div data-role="list" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pb-2">
            <PaletteResults />
          </div>
          <aside
            aria-label="Preview"
            className="flex w-[172px] flex-none flex-col border-l border-rule bg-white/60 px-4 pt-5 pb-4"
          >
            <span className="grid size-14 place-items-center rounded-[16px] bg-[linear-gradient(#fff,#eef0f4)] text-ink shadow-[inset_0_0_0_1px_var(--color-rule),0_4px_10px_-4px_rgb(0_0_0/0.15)]">
              <svg
                viewBox="0 0 24 24"
                className="size-7 fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
                aria-hidden
              >
                <path d={ICONS[selected?.command.icon ?? "search"]} />
              </svg>
            </span>
            <p
              data-role="meta"
              className="mt-4 text-[10.5px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
            >
              {group?.name ?? "No match"}
            </p>
            <p data-role="heading" className="mt-0.5 text-[16px]/[1.2] font-semibold text-balance">
              {selected?.command.name ?? "Nothing to run"}
            </p>
            <p className="mt-1.5 text-[12px]/[1.4] text-ink-2">
              {selected?.command.detail ?? "Try fewer letters"}
            </p>
            <p className="mt-3 flex flex-wrap gap-[3px]">
              {selected?.command.keys.map((key) => (
                <kbd
                  key={key}
                  className="grid h-6 min-w-6 place-items-center rounded-[6px] bg-white px-1.5 font-body text-[12px] text-ink shadow-[0_1px_0_var(--color-rule),inset_0_0_0_1px_var(--color-rule)]"
                >
                  {key}
                </kbd>
              ))}
            </p>
            <p data-role="meta" className="mt-auto text-[11px] text-ink-2">
              {uses ? `Ran ${uses.count}× · last ${uses.at}` : "Not run yet"}
            </p>
            <button
              type="button"
              disabled={selected === null}
              onClick={() => {
                if (selected) run(selected.command.id)
              }}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-[9px] bg-accent py-1.5 text-[12px] font-medium text-on-accent disabled:opacity-40"
            >
              Run <span className="opacity-70">↵</span>
            </button>
          </aside>
        </div>
        <div className="border-t border-rule px-5 py-2.5 text-[11px] [&_[data-role=key]]:border-0 [&_[data-role=key]]:bg-ink/[0.06] [&_[data-role=legend]:nth-child(3)]:hidden">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
