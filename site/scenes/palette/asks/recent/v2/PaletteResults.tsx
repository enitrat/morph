import type { CSSProperties } from "react"

import { ICONS, reveal, usePalette } from "./data"

export function PaletteResults() {
  const palette = usePalette()
  const recent = palette.words.trim() === "" ? palette.recent.slice(0, 3) : []
  return (
    <div
      data-part="results"
      id="palette-results"
      role="listbox"
      aria-label="Commands"
      className="grid"
    >
      {recent.length > 0 && (
        <div
          data-role="recent"
          role="group"
          aria-label="Jump back in"
          className="col-span-full flex items-center gap-1.5 px-2 pt-2 pb-1"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4 flex-none fill-none stroke-current stroke-[1.75] text-ink-2 [stroke-linecap:round] [stroke-linejoin:round]"
            aria-hidden
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
          </svg>
          {recent.map((run) => (
            <button
              key={run.id}
              type="button"
              data-role="pick"
              title={`Ran at ${run.at}`}
              onClick={() => {
                palette.run(run.id)
              }}
              className="flex min-w-0 items-center gap-1.5 rounded-full border border-rule py-[3px] pr-2.5 pl-1.5 text-[12px]/[1.3] transition-colors hover:border-ink-2"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5 flex-none fill-none stroke-current stroke-2 text-ink-2 [stroke-linecap:round] [stroke-linejoin:round]"
                aria-hidden
              >
                <path d={ICONS[run.command.icon]} />
              </svg>
              <span data-role="name" className="truncate">
                {run.command.name}
              </span>
            </button>
          ))}
        </div>
      )}
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
