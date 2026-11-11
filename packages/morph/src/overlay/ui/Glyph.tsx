const PATHS = {
  ask: "M8 1.8l1.5 4 4 1.4-4 1.4L8 12.6 6.5 8.6l-4-1.4 4-1.4zM13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  morph:
    "M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6M12 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM7 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z",
  specs: "M2.5 10.5l8-8 3 3-8 8zM5 8l1.2 1.2M7 6l1.2 1.2M9 4l1.2 1.2",
  sketch: "M3 13l1-3.5 7-7 2.5 2.5-7 7zM9.5 4l2.5 2.5",
  up: "M8 12.5v-9M4.5 7L8 3.5 11.5 7",
  down: "M8 3.5v9M4.5 9L8 12.5 11.5 9",
  x: "M4 4l8 8M12 4l-8 8",
  warn: "M8 2.5l6 10.5H2zM8 6.5v3M8 11.3v.2",
  frame: "M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11",
  box: "M3 3.5h10v9H3z",
  arrow: "M3.5 12.5l9-9M6.5 3.5h6v6",
  note: "M3 3h10v7H7l-3 3v-3H3z",
  panel: "M2 4.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM10 2.5v11",
  chev: "M6 4l4 4-4 4",
  comp: "M8 2l2.2 2.2L8 6.4 5.8 4.2zM8 9.6l2.2 2.2L8 14l-2.2-2.2zM4.2 5.8l2.2 2.2-2.2 2.2L2 8zM11.8 5.8L14 8l-2.2 2.2L9.6 8z",
  logo: "M3 4.5h10M8 4.5v8M5.5 8h5",
  send: "M8 13V3M4 7l4-4 4 4",
  check: "M3.5 8.5l3 3 6-7",
} as const

export type GlyphName = keyof typeof PATHS

export function Glyph({ name, size = 14 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
