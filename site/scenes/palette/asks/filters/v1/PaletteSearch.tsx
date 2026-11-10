import { countsOf, GROUPS, ICONS, usePalette } from "./data"

const SCOPES = [{ id: null, name: "All" }, ...GROUPS] as const

export function PaletteSearch() {
  const palette = usePalette()
  const counts = countsOf(palette.query)
  return (
    <div data-part="search" className="grid gap-2.5">
      <label className="flex items-center gap-2.5">
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
      <div
        data-role="scopes"
        role="group"
        aria-label="Search in"
        className="flex flex-wrap gap-1 text-[11.5px]/none"
      >
        {SCOPES.map((scope) => (
          <button
            key={scope.name}
            type="button"
            data-role="scope"
            aria-pressed={palette.scope === scope.id}
            onClick={() => {
              palette.setScope(scope.id)
            }}
            className="flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-[5px] font-medium text-ink-2 transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {scope.name}
            <span data-role="count" className="font-num tabular-nums opacity-60">
              {counts.get(scope.id) ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
