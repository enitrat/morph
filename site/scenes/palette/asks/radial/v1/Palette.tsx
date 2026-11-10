import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="radial"
      aria-label="Command palette"
      className="relative flex h-[448px] w-[420px] flex-col items-center [--color-accent:#7cc4ff] [--color-ink-2:#8d919a] [--color-ink:#16181d] [--color-on-accent:#16181d] [--color-paper:#f6f6f8] [--color-rule:#e1e2e7] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="relative size-[396px] flex-none rounded-full bg-paper font-body text-[11px]/[1.15] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_30px_70px_-20px_rgb(0_0_0/0.85)] [&_[data-part=results]_[data-role=icon]]:size-9 [&_[data-part=results]_[data-role=icon]]:rounded-full [&_[data-part=results]_[data-role=icon]]:bg-ink/[0.055] [&_[data-part=results]_[data-role=icon]]:p-[9px] [&_[data-part=results]_[data-role=icon]]:text-ink [&_[data-part=results]_[data-role=icon]]:transition-[background-color,box-shadow] [&_[data-part=search]_[data-role=icon]]:hidden [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=detail]]:hidden [&_[data-role=empty]]:hidden [&_[data-role=ghost]]:hidden [&_[data-role=group]]:hidden [&_[data-role=input]]:border-b [&_[data-role=input]]:border-white/15 [&_[data-role=input]]:pb-1.5 [&_[data-role=input]]:text-center [&_[data-role=input]]:text-[15px] [&_[data-role=input]]:font-medium [&_[data-role=input]]:text-paper [&_[data-role=keys]]:hidden [&_[data-role=name]]:text-balance [&_[data-role=name]]:whitespace-normal [&_[data-role=row]]:absolute [&_[data-role=row]]:top-1/2 [&_[data-role=row]]:left-1/2 [&_[data-role=row]]:w-[84px] [&_[data-role=row]]:flex-col [&_[data-role=row]]:gap-1.5 [&_[data-role=row]]:bg-transparent [&_[data-role=row]]:p-0 [&_[data-role=row]]:text-center [&_[data-role=row]]:font-medium [&_[data-role=row]]:[--a:calc(var(--slot)*45deg_-_90deg)] [&_[data-role=row]]:[translate:calc(-50%_+_cos(var(--a))*143px)_calc(-50%_+_sin(var(--a))*143px)] [&_[data-role=row][aria-selected=true]_[data-role=icon]]:bg-ink [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_30%,transparent)] [&_[data-role=section]]:contents [&_[data-role=recent]]:hidden [&_[data-role=scope]:not([aria-pressed=true])]:hidden [&_[data-role=scopes]]:justify-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[96px] rounded-full shadow-[0_0_0_1px_var(--color-rule)]"
        />
        <div data-role="list" className="absolute inset-0">
          <PaletteResults />
        </div>
        <div className="absolute top-1/2 left-1/2 flex size-[168px] -translate-1/2 flex-col items-center justify-center gap-2 rounded-full bg-ink px-6 text-center text-paper shadow-[0_12px_30px_rgb(0_0_0/0.35)]">
          <PaletteSearch />
          <p
            data-role="heading"
            className="max-w-[124px] truncate text-[13px] font-semibold text-accent"
          >
            {selected?.command.name ?? "No match"}
          </p>
          <p data-role="meta" className="text-[10.5px] text-ink-2">
            {selected ? `${selected.command.keys.join(" ")} · ↵ to run` : "Try fewer letters"}
          </p>
        </div>
      </div>
      <div className="mt-auto rounded-full bg-paper px-3.5 py-1.5 font-body text-ink shadow-[0_10px_24px_-12px_rgb(0_0_0/0.8)] [&_[data-role=status]]:ml-0">
        <PaletteFooter />
      </div>
    </section>
  )
}
