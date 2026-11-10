import type { CSSProperties } from "react"

import { ICONS, reveal, usePalette } from "./data"

export function PaletteResults() {
  const palette = usePalette()
  const most = Math.max(1, ...[...palette.runs.values()].map((uses) => uses.count))
  return (
    <div
      data-part="results"
      id="palette-results"
      role="listbox"
      aria-label="Commands"
      className="grid"
    >
      {palette.sections.map((section) => (
        <div
          key={section.group.id}
          data-role="section"
          role="group"
          aria-label={section.group.name}
          className="grid"
        >
          <p data-role="group" className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-ink-2">
            {section.group.name}
          </p>
          {section.matches.map((match) => {
            const selected = match === palette.selected
            const uses = palette.runs.get(match.command.id)
            return (
              <div
                key={match.command.id}
                ref={selected ? reveal : undefined}
                id={`palette-${match.command.id}`}
                data-role="row"
                role="option"
                aria-selected={selected}
                style={{ "--slot": match.slot } as CSSProperties}
                onPointerMove={() => {
                  palette.select(match.command.id)
                }}
                onClick={() => {
                  palette.run(match.command.id)
                }}
                className="flex cursor-default items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 aria-selected:bg-ink/[0.06]"
              >
                <svg
                  data-role="icon"
                  viewBox="0 0 24 24"
                  className="size-4 flex-none fill-none stroke-current stroke-[1.75] text-ink-2 [stroke-linecap:round] [stroke-linejoin:round]"
                  aria-hidden
                >
                  <path d={ICONS[match.command.icon]} />
                </svg>
                <span className="grid min-w-0 flex-1">
                  <span data-role="name" className="truncate">
                    {match.segments.map((segment, at) =>
                      segment.hit ? (
                        <mark
                          key={at}
                          data-role="hit"
                          className="bg-transparent font-semibold text-inherit underline decoration-[1.5px] underline-offset-2"
                        >
                          {segment.text}
                        </mark>
                      ) : (
                        segment.text
                      ),
                    )}
                  </span>
                  <span data-role="detail" className="hidden truncate text-[11.5px] text-ink-2">
                    {match.command.detail}
                  </span>
                </span>
                {uses && (
                  <span
                    data-role="uses"
                    title={`Ran ${uses.count === 1 ? "once" : `${uses.count} times`}, last at ${uses.at}`}
                    className="flex flex-none items-center gap-1.5 font-num text-[10.5px] text-ink-2 tabular-nums"
                  >
                    <span className="h-1 w-8 overflow-hidden rounded-full bg-ink/10">
                      <span
                        data-role="meter"
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${(uses.count / most) * 100}%` }}
                      />
                    </span>
                    {uses.count}×
                  </span>
                )}
                <span data-role="keys" className="flex flex-none gap-[3px]">
                  {match.command.keys.map((key) => (
                    <kbd
                      key={key}
                      data-role="key"
                      className="min-w-[18px] rounded-[4px] border border-rule px-[5px] py-[2px] text-center font-body text-[11px]/none text-ink-2"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      ))}
      {palette.matches.length === 0 && (
        <p data-role="empty" className="px-3 py-6 text-center text-[12.5px] text-ink-2">
          No command matches “{palette.query.trim()}”
        </p>
      )}
    </div>
  )
}
