import { ICONS, usePalette } from "./data"

export function PaletteSearch() {
  const palette = usePalette()
  return (
    <label data-part="search" className="flex items-center gap-2.5">
      <svg
        data-role="icon"
        viewBox="0 0 24 24"
        className="size-4 flex-none fill-none stroke-current stroke-2 text-ink-2 [stroke-linecap:round] [stroke-linejoin:round]"
        aria-hidden
      >
        <path d={ICONS.search} />
      </svg>
      <span className="grid min-w-0 flex-1">
        <span
          data-role="ghost"
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 overflow-hidden whitespace-pre text-ink-2/55"
        >
          <span className="invisible">{palette.query}</span>
          {palette.completion}
        </span>
        <input
          data-role="input"
          type="text"
          role="combobox"
          aria-label="Search commands"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={
            palette.selected ? `palette-${palette.selected.command.id}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search commands…"
          value={palette.query}
          onChange={(event) => {
            palette.setQuery(event.target.value)
          }}
          onKeyDown={palette.onKeyDown}
          style={{ outline: "none" }}
          className="col-start-1 row-start-1 min-w-0 bg-transparent font-[inherit] text-ink placeholder:text-ink-2/70"
        />
      </span>
      <kbd
        data-role="key"
        className="flex-none rounded-[4px] border border-rule px-1.5 py-px font-body text-[10.5px] text-ink-2"
      >
        esc
      </kbd>
    </label>
  )
}
