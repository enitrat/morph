import { Pass } from "../pass/Pass"
import { Player } from "../player/Player"
import { Palette } from "../palette/Palette"
import { Receipt } from "../receipt/Receipt"

/**
 * The board, a desk seen from above, and every object on it. The table's art direction is
 * `theme.css`, which styles each object through the tokens and data attributes in the README.
 */
export function Table() {
  return (
    <div
      data-board
      className="relative flex min-h-[720px] flex-wrap items-center justify-center gap-x-20 gap-y-12 rounded-[22px] border border-[var(--color-board-edge)] bg-[var(--color-board)] bg-[radial-gradient(var(--color-dot)_1px,transparent_1.4px)] bg-size-[18px_18px] bg-position-[9px_9px] px-6 pt-20 pb-16 select-none [--color-board-edge:#1f2126] [--color-board:#131417] [--color-dot:#2a2c32]"
    >
      <Placard />
      <Receipt />
      <Pass />
      <Player />
      <Palette />
    </div>
  )
}

/** A table-tent card standing in for the objects that join the board next. */
function Placard() {
  return (
    <aside
      data-object="placard"
      className="w-[220px] rotate-[1.5deg] [--color-ink-2:#8a8d94] [--color-ink:#1b1d22] [--color-paper:#fbfaf6] [--color-rule:#e3e1da] [--font-body:var(--font-sans)] [--font-display:var(--font-serif)]"
    >
      <div
        data-role="paper"
        className="rounded-[10px] bg-paper px-6 pt-7 pb-6 text-center font-body text-ink shadow-[0_24px_40px_-20px_rgb(0_0_0/0.7),0_2px_5px_rgb(0_0_0/0.3)]"
      >
        <p
          data-role="meta"
          className="text-[10px] font-medium tracking-[0.2em] text-ink-2 uppercase"
        >
          Table 4
        </p>
        <h3 data-role="heading" className="mt-3 font-display text-[40px]/[1] italic">
          Réservé
        </h3>
        <hr data-role="rule" className="mx-auto my-4 w-10 border-0 border-t border-rule" />
        <p data-role="meta" className="text-[12px] text-ink-2">
          Morgan · 08:30
        </p>
      </div>
    </aside>
  )
}
