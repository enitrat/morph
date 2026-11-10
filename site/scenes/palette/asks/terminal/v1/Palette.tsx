import { usePalette } from "./data"
import { PaletteFooter } from "./PaletteFooter"
import { PaletteResults } from "./PaletteResults"
import { PaletteSearch } from "./PaletteSearch"

export function Palette() {
  const { matches } = usePalette()
  return (
    <section
      data-object="palette"
      data-layout="terminal"
      aria-label="Command palette"
      className="w-[420px] [--color-accent:#7cc4ff] [--color-ink-2:#5f6672] [--color-ink:#d4d8e0] [--color-on-accent:#0e1014] [--color-paper:#0e1014] [--color-rule:#23272f] [--font-body:var(--font-mono)] [--font-display:var(--font-mono)] [--font-num:var(--font-mono)]"
    >
      <div
        data-role="paper"
        className="flex h-[448px] flex-col overflow-hidden rounded-[10px] bg-paper font-body text-[12.5px]/[1.65] text-ink shadow-[0_0_0_1px_var(--color-rule),0_30px_60px_-20px_rgb(0_0_0/0.9)] [&_[data-part=results]_[data-role=icon]]:hidden [&_[data-part=results]_[data-role=key]]:min-w-0 [&_[data-part=results]_[data-role=key]]:border-0 [&_[data-part=results]_[data-role=key]]:p-0 [&_[data-part=results]_[data-role=key]]:text-[12px] [&_[data-part=results]_[data-role=keys]]:gap-0 [&_[data-part=search]]:gap-2 [&_[data-part=search]_[data-role=icon]]:hidden [&_[data-part=search]_[data-role=key]]:hidden [&_[data-role=empty]]:p-0 [&_[data-role=empty]]:text-left [&_[data-role=empty]]:text-[12.5px] [&_[data-role=ghost]]:text-ink-2 [&_[data-role=group]]:p-0 [&_[data-role=group]]:pt-1.5 [&_[data-role=group]]:text-[12px] [&_[data-role=group]]:font-normal [&_[data-role=group]]:lowercase [&_[data-role=group]]:before:content-['#_'] [&_[data-role=hit]]:font-normal [&_[data-role=hit]]:text-accent [&_[data-role=hit]]:no-underline [&_[data-role=input]]:caret-accent [&_[data-role=input]]:placeholder:text-transparent [&_[data-role=name]]:lowercase [&_[data-role=row]]:gap-0 [&_[data-role=row]]:rounded-none [&_[data-role=row]]:px-0 [&_[data-role=row]]:py-0 [&_[data-role=row]]:before:w-4 [&_[data-role=row]]:before:flex-none [&_[data-role=row]]:before:text-accent [&_[data-role=row]]:before:content-[''] [&_[data-role=row][aria-selected=true]]:bg-accent/12 [&_[data-role=row][aria-selected=true]]:text-ink [&_[data-role=row][aria-selected=true]]:before:content-['›'] [&_[data-role=scope]]:rounded-none [&_[data-role=scope]]:border-0 [&_[data-role=scope]]:px-1 [&_[data-role=scope]]:py-0 [&_[data-role=scopes]]:gap-x-0.5 [&_[data-role=scopes]]:text-[11px] [&_[data-role=pick]]:py-0"
      >
        <div className="flex items-center gap-1.5 bg-ink/[0.045] px-3 py-2 font-[family-name:var(--font-ui)] text-[11px]/none text-ink-2">
          <i className="size-2.5 rounded-full bg-ink/20" />
          <i className="size-2.5 rounded-full bg-ink/20" />
          <i className="size-2.5 rounded-full bg-ink/20" />
          <span data-role="heading" className="mx-auto -translate-x-6">
            studio — zsh
          </span>
        </div>
        <div className="px-3.5 pt-3 text-ink-2">
          <p data-role="meta">Last login: Sat 14 Nov 08:41 on ttys004</p>
          <p data-role="meta">
            {matches.length} command{matches.length === 1 ? "" : "s"}. tab completes, ↵ runs.
          </p>
          <div className="mt-1.5 flex items-start gap-2 text-ink">
            <span className="flex-none text-accent">~/studio ❯</span>
            <div className="min-w-0 flex-1">
              <PaletteSearch />
            </div>
          </div>
        </div>
        <div data-role="list" className="mt-1 min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
          <PaletteResults />
        </div>
        <div className="flex items-center gap-3 bg-ink/[0.07] py-1 pr-3 pl-0 text-[11px] text-ink-2 [&_[data-role=key]]:border-0 [&_[data-role=key]]:p-0 [&_[data-role=key]]:text-accent [&_[data-role=legend]:nth-child(3)]:hidden">
          <span className="flex-none bg-accent px-2 font-semibold text-on-accent">NORMAL</span>
          <div className="min-w-0 flex-1">
            <PaletteFooter />
          </div>
        </div>
      </div>
    </section>
  )
}
