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
      className="relative flex min-h-[560px] flex-wrap items-center justify-center gap-x-4 gap-y-12 rounded-[22px] border border-[var(--color-board-edge)] bg-[var(--color-board)] bg-[radial-gradient(var(--color-dot)_1px,transparent_1.4px)] bg-size-[18px_18px] bg-position-[9px_9px] px-3 pt-[72px] pb-10 select-none [--color-board-edge:#1f2126] [--color-board:#131417] [--color-dot:#2a2c32]"
    >
      <Receipt />
      <Pass />
      <Palette />
      <Player />
    </div>
  )
}
