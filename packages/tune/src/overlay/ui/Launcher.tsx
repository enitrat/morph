import { MotionConfig } from "motion/react"
import type { ReactNode } from "react"

import { MorphingDock, type DockTool } from "./MorphingDock"

function Glyph({ d }: { d: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}

function Row({ k, label, value }: { k: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-transform duration-150 hover:-translate-y-px hover:bg-surface-2">
      <span className="grid size-5 place-items-center rounded-sm bg-surface-2 font-mono text-xs text-ink-2 ring-1 ring-line ring-inset">
        {k}
      </span>
      <span className="flex-1 font-medium">{label}</span>
      <span className="tnum font-mono text-xs text-ink-2">{value}</span>
    </div>
  )
}

const TOOLS: DockTool[] = [
  {
    id: "inspect",
    label: "Inspect",
    shortcut: "i",
    height: 132,
    icon: <Glyph d="M4 4l7 16 2.5-6.5L20 11z" />,
    panel: (
      <div className="grid gap-1 p-3">
        <Row k="1" label="Padding" value="12px 16px" />
        <Row k="2" label="Radius" value="10px" />
        <Row k="3" label="Gap" value="8px" />
      </div>
    ),
  },
  {
    id: "measure",
    label: "Measure",
    shortcut: "m",
    badge: 2,
    height: 108,
    icon: <Glyph d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4" />,
    panel: (
      <div className="flex flex-col gap-2 p-3">
        <span className="font-mono text-xs text-measure">248 × 36</span>
        <button
          type="button"
          className="ring-focus self-start rounded-md bg-accent px-2.5 py-1.5 font-semibold text-on-accent shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_6px_16px_-6px_rgb(124_196_255/0.6)] ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-transparent"
        >
          Pin measurement
        </button>
      </div>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    shortcut: "n",
    height: 84,
    icon: <Glyph d="M5 4h14v16H5zM9 9h6M9 13h6" />,
    panel: (
      <p className="p-3 text-ink-2">
        Temporary launcher: the dock is additive until the rebuild replaces the tab.
      </p>
    ),
  },
]

/** Spike launcher: Detent's dock in the Ice tokens, docked at the bottom of the viewport. */
export function Launcher() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="ui pointer-events-none fixed inset-0 z-[2147483645]">
        <MorphingDock tools={TOOLS} recede={false} width={320} />
      </div>
    </MotionConfig>
  )
}
