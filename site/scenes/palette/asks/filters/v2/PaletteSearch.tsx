import { GROUPS, ICONS, usePalette } from "./data"

const ORDER = [null, ...GROUPS.map((group) => group.id)] as const

export function PaletteSearch() {
  const palette = usePalette()
  const scope = GROUPS.find((group) => group.id === palette.scope)
  const next = ORDER[(ORDER.indexOf(palette.scope) + 1) % ORDER.length] ?? null
  return (
    <div data-part="search" className="flex items-center gap-2.5">
      <svg
        data-role="icon"
        viewBox="0 0 24 24"
        className="size-4 flex-none fill-none stroke-current stroke-2 text-ink-2 [stroke-linecap:round] [stroke-linejoin:round]"
        aria-hidden
      >
        <path d={ICONS.search} />
      </svg>
      <button
        type="button"
        data-role="scope"
        aria-pressed={scope !== undefined}
        aria-label={`Searching ${scope?.name ?? "all groups"}; switch to ${GROUPS.find((group) => group.id === next)?.name ?? "all groups"}`}
        onClick={() => {
          palette.setScope(next)
        }}
        className="flex flex-none items-center gap-1 rounded-[6px] border border-rule py-[3px] pr-1.5 pl-2 text-[0.8em]/none font-medium text-ink-2 transition-colors aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
      >
        {scope?.name ?? "All"}
        <svg
          viewBox="0 0 24 24"
          className="size-3 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
          aria-hidden
        >
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>
      <span className="grid min-w-0 flex-1">
        <span
          data-role="ghost"
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 overflow-hidden whitespace-pre text-ink-2/55"
        >
          <span className="invisible">{palette.words}</span>
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
          placeholder={scope ? `Search ${scope.name.toLowerCase()}…` : "Search commands…"}
          value={palette.words}
          onChange={(event) => {
            palette.setQuery(scope ? `in:${scope.id} ${event.target.value}` : event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && palette.words === "" && scope) {
              event.preventDefault()
              palette.setScope(null)
              return
            }
            palette.onKeyDown(event)
          }}
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
    </div>
  )
}
