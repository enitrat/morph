import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { selected } = usePalette()
  const from = selected === null ? null : selected.slot * 45 - 22.5
  return (
    <section
      data-object="palette"
      data-layout="wheel"
      aria-label="Command palette"
      className="relative flex h-[448px] w-[420px] flex-col items-center [--color-accent:#1b1d22] [--color-ink-2:#80838c] [--color-ink:#1b1d22] [--color-on-accent:#ffffff] [--color-paper:#f9f8f5] [--color-rule:#dedcd5] [--font-body:var(--font-sans)] [--font-display:var(--font-sans)] [--font-num:var(--font-sans)]"
    >
      <div
        data-role="paper"
        className="relative size-[400px] flex-none overflow-hidden rounded-full bg-paper font-body text-[11.5px]/[1.15] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_30px_70px_-20px_rgb(0_0_0/0.85)] [&_[data-part=results]_[data-role=icon]]:size-[18px] [&_[data-part=search]_[data-role=icon]]:hidden [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=detail]]:hidden [&_[data-role=empty]]:hidden [&_[data-role=ghost]]:hidden [&_[data-role=group]]:hidden [&_[data-role=input]]:text-center [&_[data-role=input]]:text-[14px] [&_[data-role=input]]:font-medium [&_[data-role=keys]]:hidden [&_[data-role=name]]:text-balance [&_[data-role=name]]:whitespace-normal [&_[data-role=row]]:absolute [&_[data-role=row]]:top-1/2 [&_[data-role=row]]:left-1/2 [&_[data-role=row]]:w-[78px] [&_[data-role=row]]:flex-col [&_[data-role=row]]:gap-1 [&_[data-role=row]]:bg-transparent [&_[data-role=row]]:p-0 [&_[data-role=row]]:text-center [&_[data-role=row]]:font-semibold [&_[data-role=row]]:tracking-[-0.005em] [&_[data-role=row]]:transition-colors [&_[data-role=row]]:[--a:calc(var(--slot)*45deg_-_90deg)] [&_[data-role=row]]:[translate:calc(-50%_+_cos(var(--a))*136px)_calc(-50%_+_sin(var(--a))*136px)] [&_[data-role=row][aria-selected=true]]:text-on-accent [&_[data-role=row][aria-selected=true]_[data-role=icon]]:text-on-accent [&_[data-role=section]]:contents [&_[data-role=recent]]:hidden [&_[data-role=scope]:not([aria-pressed=true])]:hidden [&_[data-role=scopes]]:justify-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[repeating-conic-gradient(from_-22.5deg,transparent_0_44.6deg,var(--color-rule)_44.6deg_45deg)] [mask:radial-gradient(circle,transparent_0_72px,#000_73px)]"
        />
        {from !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full transition-[background-image] [mask:radial-gradient(circle,transparent_0_72px,#000_73px_193px,transparent_194px)]"
            style={{
              backgroundImage: `conic-gradient(from ${from}deg, var(--color-accent) 0 45deg, transparent 45deg)`,
            }}
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[7px] rounded-full border border-rule"
        />
        <div data-role="list" className="absolute inset-0">
          <PaletteResults />
        </div>
        <div className="absolute top-1/2 left-1/2 flex size-[146px] -translate-1/2 flex-col items-center justify-center gap-2 rounded-full bg-paper px-5 text-center shadow-[0_0_0_1px_var(--color-rule),0_8px_20px_-8px_rgb(0_0_0/0.25)]">
          <PaletteSearch />
          <span className="h-px w-10 bg-rule" />
          <p data-role="meta" className="flex gap-[3px] text-[10.5px] text-ink-2">
            {selected
              ? selected.command.keys.map((key) => (
                  <kbd
                    key={key}
                    className="grid h-5 min-w-5 place-items-center rounded-[5px] border border-rule bg-white px-1 font-body text-ink"
                  >
                    {key}
                  </kbd>
                ))
              : "No match"}
          </p>
        </div>
      </div>
      <div className="mt-auto rounded-full bg-paper px-3.5 py-1.5 font-body text-ink shadow-[0_10px_24px_-12px_rgb(0_0_0/0.8)] [&_[data-role=status]]:ml-0">
        <PaletteFooter />
      </div>
    </section>
  )
}
