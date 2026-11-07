const PATHS = {
  pencil: "M11.5 2.5l2 2L6 12H4v-2l7.5-7.5zM10 4l2 2",
  close: "M4 4l8 8M12 4l-8 8",
  point: "M4 2.5l8 4.5-3.5 1L7 11.5 4 2.5z",
  box: "M3 3.5h10v9H3z",
  arrow: "M3 13L12.5 3.5M7 3.5h5.5V9",
  note: "M3 3h10v7H7l-3 3v-3H3z",
  minus: "M4 8h8",
  plus: "M4 8h8M8 4v8",
  collapse: "M4 6l4 4 4-4",
  expand: "M4 10l4-4 4 4",
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
