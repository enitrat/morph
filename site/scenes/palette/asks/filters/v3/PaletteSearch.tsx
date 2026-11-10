import { countsOf, GROUPS, ICONS, usePalette } from "./data"

export function PaletteSearch() {
  const palette = usePalette()
  const counts = countsOf(palette.query)
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
          placeholder="Search commands…"
          value={palette.words}
          onChange={(event) => {
            palette.setQuery(
              palette.scope ? `in:${palette.scope} ${event.target.value}` : event.target.value,
            )
          }}
          onKeyDown={palette.onKeyDown}
          style={{ outline: "none" }}
          className="col-start-1 row-start-1 min-w-0 bg-transparent font-[inherit] text-ink placeholder:text-ink-2/70"
        />
      </span>
      <label
        data-role="scopes"
        className="relative flex flex-none items-center gap-1 border-l border-rule pl-2.5 text-[0.8em]/none text-ink-2"
      >
        <span data-role="label">in</span>
        <span data-role="scope" className="font-semibold text-ink">
          {GROUPS.find((group) => group.id === palette.scope)?.name ?? "All"}
        </span>
        <span data-role="count" className="font-num tabular-nums">
          {counts.get(palette.scope) ?? 0}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="size-3 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
          aria-hidden
        >
          <path d="m8 10 4 4 4-4" />
        </svg>
        <select
          aria-label="Search in"
          value={palette.scope ?? ""}
          onChange={(event) => {
            palette.setScope(GROUPS.find((group) => group.id === event.target.value)?.id ?? null)
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">All · {counts.get(null) ?? 0}</option>
          {GROUPS.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} · {counts.get(group.id) ?? 0}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
