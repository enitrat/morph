import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

const HOLES = "radial-gradient(circle at 11px 9px, #0000 4px, #000 4.5px)"

/** Tractor-feed margins: a hole every 18 px down both sides. */
const FEED = [
  `${HOLES} left top / 22px 18px repeat-y`,
  `${HOLES} right top / 22px 18px repeat-y`,
  "linear-gradient(#000, #000) center / calc(100% - 44px) 100% no-repeat",
].join(", ")

export function Palette() {
  const { recent } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="teletype"
      aria-label="Command palette"
      className="w-[420px] -rotate-[0.6deg] drop-shadow-[0_24px_26px_rgb(0_0_0/0.6)] [--color-accent:#c2410c] [--color-ink-2:#958f82] [--color-ink:#2b2a26] [--color-on-accent:#ffffff] [--color-paper:#f3efe3] [--color-rule:#d6cfbd] [--font-body:var(--font-thermal)] [--font-display:var(--font-thermal)] [--font-num:var(--font-thermal)]"
    >
      <div
        data-role="paper"
        style={{ mask: FEED }}
        className="flex h-[448px] bg-paper px-[22px] font-body text-[11.5px]/[1.5] text-ink [&_[data-part=results]_[data-role=icon]]:hidden [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:p-0 [&_[data-part=results]_[data-role=key]]:text-[11px] [&_[data-part=results]_[data-role=key]]:text-ink [&_[data-part=results]_[data-role=keys]]:gap-0.5 [&_[data-part=search]]:gap-2 [&_[data-part=search]_[data-role=icon]]:hidden [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=empty]]:p-0 [&_[data-role=empty]]:py-2 [&_[data-role=empty]]:text-left [&_[data-role=ghost]]:text-ink-2/70 [&_[data-role=group]]:mt-1 [&_[data-role=group]]:p-0 [&_[data-role=group]]:text-[10.5px] [&_[data-role=group]]:font-bold [&_[data-role=group]]:tracking-[0.12em] [&_[data-role=group]]:text-ink [&_[data-role=group]]:uppercase [&_[data-role=hit]]:font-bold [&_[data-role=hit]]:decoration-accent [&_[data-role=hit]]:decoration-2 [&_[data-role=input]]:caret-accent [&_[data-role=row]]:gap-2 [&_[data-role=row]]:rounded-none [&_[data-role=row]]:border-b [&_[data-role=row]]:border-dotted [&_[data-role=row]]:border-rule [&_[data-role=row]]:px-1 [&_[data-role=row]]:py-px [&_[data-role=row][aria-selected=true]]:bg-ink [&_[data-role=row][aria-selected=true]]:text-paper [&_[data-role=row][aria-selected=true]_[data-role=key]]:text-paper [&_[data-role=scope]]:rounded-none [&_[data-role=scope]]:border-ink [&_[data-role=scope]]:py-0.5 [&_[data-role=pick]]:rounded-none [&_[data-role=pick]]:py-0"
      >
        <div className="flex min-w-0 flex-1 flex-col border-x border-dashed border-rule px-4 pt-3.5 pb-3">
          <header className="flex justify-between border-b-2 border-ink pb-1">
            <h3 data-role="heading" className="text-[12px] font-bold tracking-[0.14em]">
              STUDIO TTY
            </h3>
            <p data-role="meta" className="text-ink-2">
              14 NOV 2026
            </p>
          </header>
          <ol className="mt-2 text-ink-2">
            {recent
              .slice(0, 3)
              .toReversed()
              .map((run) => (
                <li key={run.id} className="flex gap-2">
                  <span>{run.at}</span>
                  <span className="min-w-0 flex-1 truncate">
                    $ {run.command.name.toLowerCase()}
                  </span>
                  <span>ok</span>
                </li>
              ))}
          </ol>
          <div className="mt-1 flex items-start gap-2 border-b border-rule pb-1.5">
            <span className="flex-none font-bold text-accent">$</span>
            <div className="min-w-0 flex-1">
              <PaletteSearch />
            </div>
          </div>
          <div data-role="list" className="min-h-0 flex-1 overflow-y-auto pt-0.5">
            <PaletteResults />
          </div>
          <div className="mt-2 flex justify-center border-t-2 border-ink pt-1.5 text-[10.5px] [&_[data-role=key]]:border-0 [&_[data-role=key]]:p-0 [&_[data-role=key]]:font-bold [&_[data-role=key]]:text-ink [&_[data-role=status]]:hidden">
            <PaletteFooter />
          </div>
        </div>
      </div>
    </section>
  )
}
