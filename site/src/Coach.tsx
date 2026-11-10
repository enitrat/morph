import { useSyncExternalStore } from "react"

import type { Level } from "../stage/manifest"
import type { Stage } from "../stage/stage"

const STEPS: readonly { level: Level; title: string; short: string; hint: string }[] = [
  { level: "part", title: "Pick a part", short: "Part", hint: "the total or the items" },
  { level: "object", title: "Restyle the object", short: "Object", hint: "the receipt itself" },
  { level: "table", title: "Art-direct the table", short: "Table", hint: "the board around it" },
]

/**
 * The three levels an ask can take, checked off as the visitor asks at each: each level is its
 * own file, so the asks stack instead of replacing each other.
 */
export function Coach({ stage, touch }: { stage: Stage; touch: boolean }) {
  const { log } = useSyncExternalStore(stage.subscribe, stage.snapshot)
  const asked = new Set(log.filter((entry) => entry.op === "ask").map((entry) => entry.level))
  const next = STEPS.find((step) => !asked.has(step.level))
  return (
    <ol
      data-morph
      aria-label="Try the three levels"
      className="pointer-events-none absolute top-3.5 right-3.5 left-[76px] flex flex-wrap justify-end gap-x-1 gap-y-1.5 text-[12px]/none"
    >
      {STEPS.map((step, index) => {
        const done = asked.has(step.level)
        const current = step === next
        return (
          <li
            key={step.level}
            className={`flex items-center gap-2 rounded-[7px] py-1.5 pr-2.5 pl-1.5 transition-colors duration-300 ${
              current ? "bg-[#1d2027] text-text" : done ? "text-muted" : "text-faint"
            }`}
          >
            <span
              className={`grid size-[18px] place-items-center rounded-full font-mono text-[10px] font-semibold transition-colors duration-300 ${
                done
                  ? "bg-ice text-[#071523]"
                  : current
                    ? "shadow-[inset_0_0_0_1px_rgb(124_196_255/0.6)] text-ice"
                    : "shadow-[inset_0_0_0_1px_#33363d]"
              }`}
            >
              {done ? (
                <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
                  <path
                    d="M2.5 6.2 5 8.5l4.5-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="font-medium">
              <span className="sm:hidden">{step.short}</span>
              <span className="hidden sm:inline">{step.title}</span>
            </span>
            {current && !touch && <span className="hidden text-muted lg:inline">{step.hint}</span>}
          </li>
        )
      })}
    </ol>
  )
}
