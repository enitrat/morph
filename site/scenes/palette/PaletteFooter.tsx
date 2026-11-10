import { usePalette } from "./data"

const LEGEND = [
  { keys: ["↑", "↓"], label: "to move" },
  { keys: ["↵"], label: "to run" },
  { keys: ["tab"], label: "to complete" },
] as const

export function PaletteFooter() {
  const { last } = usePalette()
  return (
    <footer data-part="footer" className="flex items-center gap-3.5 text-[11.5px] text-ink-2">
      {LEGEND.map((entry) => (
        <span
          key={entry.label}
          data-role="legend"
          className="flex items-center gap-1 whitespace-nowrap"
        >
          {entry.keys.map((key) => (
            <kbd
              key={key}
              data-role="key"
              className="min-w-[17px] rounded-[4px] border border-rule px-1 py-px text-center font-body text-[10.5px]/[1.3]"
            >
              {key}
            </kbd>
          ))}
          <span data-role="label">{entry.label}</span>
        </span>
      ))}
      {last && (
        <span data-role="status" aria-live="polite" className="ml-auto min-w-0 truncate">
          Ran {last.command.name} · {last.at}
        </span>
      )}
    </footer>
  )
}
