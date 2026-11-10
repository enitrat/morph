import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="dial"
      aria-label="Command palette"
      className="w-[420px] [--color-accent:#ff6b3d] [--color-ink-2:#8b9099] [--color-ink:#eceef2] [--color-on-accent:#ffffff] [--color-paper:#17191e] [--color-rule:#2c3038] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="relative h-[448px] overflow-hidden rounded-[32px] bg-paper font-body text-[11px]/[1.15] text-ink shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset,0_30px_70px_-20px_rgb(0_0_0/0.9)] [&_[data-part=results]_[data-role=icon]]:size-[34px] [&_[data-part=results]_[data-role=icon]]:rounded-full [&_[data-part=results]_[data-role=icon]]:bg-white/[0.07] [&_[data-part=results]_[data-role=icon]]:p-[8px] [&_[data-part=results]_[data-role=icon]]:text-ink [&_[data-part=search]_[data-role=icon]]:text-accent [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=detail]]:hidden [&_[data-role=empty]]:hidden [&_[data-role=group]]:hidden [&_[data-role=input]]:text-[15px] [&_[data-role=input]]:font-medium [&_[data-role=keys]]:hidden [&_[data-role=name]]:text-balance [&_[data-role=name]]:whitespace-normal [&_[data-role=name]]:text-ink/80 [&_[data-role=row]]:absolute [&_[data-role=row]]:top-full [&_[data-role=row]]:left-1/2 [&_[data-role=row]]:w-[76px] [&_[data-role=row]]:flex-col [&_[data-role=row]]:gap-1.5 [&_[data-role=row]]:bg-transparent [&_[data-role=row]]:p-0 [&_[data-role=row]]:text-center [&_[data-role=row]]:font-medium [&_[data-role=row]]:[--a:calc(var(--slot)*22.5deg_+_191.25deg)] [&_[data-role=row]]:[translate:calc(-50%_+_cos(var(--a))*176px)_calc(-50%_+_sin(var(--a))*176px)] [&_[data-role=row][aria-selected=true]_[data-role=icon]]:bg-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_28%,transparent),0_6px_18px_-4px_var(--color-accent)] [&_[data-role=row][aria-selected=true]_[data-role=name]]:text-ink [&_[data-role=section]]:contents [&_[data-role=recent]]:hidden [&_[data-role=scope]:not([aria-pressed=true])]:hidden [&_[data-role=scopes]]:justify-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-[100px] left-1/2 size-[300px] -translate-x-1/2 rounded-full border border-dashed border-rule [clip-path:inset(0_0_50%_0)]"
        />
        <div data-role="list" className="absolute inset-x-0 top-0 h-[250px]">
          <PaletteResults />
        </div>
        <div className="absolute top-[224px] left-1/2 w-[212px] -translate-x-1/2 rounded-full bg-white/[0.06] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-rule),0_10px_24px_-10px_rgb(0_0_0/0.8)]">
          <PaletteSearch />
        </div>
        <div className="absolute inset-x-0 top-[300px] flex flex-col items-center gap-1 px-8 text-center">
          <p
            data-role="heading"
            className="max-w-full truncate text-[19px]/[1.2] font-semibold text-accent"
          >
            {selected?.command.name ?? "No match"}
          </p>
          <p data-role="meta" className="max-w-full truncate text-[12px] text-ink-2">
            {selected?.command.detail ?? "Try fewer letters"}
          </p>
          <p className="mt-1.5 flex gap-1">
            {selected?.command.keys.map((key) => (
              <kbd
                key={key}
                className="grid h-6 min-w-6 place-items-center rounded-[6px] bg-white/[0.08] px-1.5 font-body text-[12px] text-ink shadow-[inset_0_-1px_0_rgb(0_0_0/0.4)]"
              >
                {key}
              </kbd>
            ))}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-center border-t border-rule px-5 py-3 text-[11px] [&_[data-role=key]]:border-rule [&_[data-role=status]]:ml-0">
          <PaletteFooter />
        </div>
      </div>
    </section>
  )
}
