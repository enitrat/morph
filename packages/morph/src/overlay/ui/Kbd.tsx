function Return() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Return"
    >
      <path d="M18.5 5.5V11a3 3 0 0 1-3 3H5.5M10 9.5 5.5 14l4.5 4.5" />
    </svg>
  )
}

export function keyLabel(text: string) {
  return text
    .split(/(↵)/)
    .filter(Boolean)
    .map((part, i) => (part === "↵" ? <Return key={i} /> : part))
}

export function Kbd({ children, onInk = false }: { children: string; onInk?: boolean }) {
  return (
    <kbd
      className={`inline-flex pointer-coarse:hidden h-5 min-w-5 items-center justify-center gap-px rounded-chip px-1 font-sans text-caption font-medium leading-none ${
        onInk
          ? "bg-[color-mix(in_oklch,var(--surface)_16%,transparent)] text-[color-mix(in_oklch,var(--surface)_72%,transparent)]"
          : "bg-surface-2 text-ink-2"
      }`}
    >
      {keyLabel(children)}
    </kbd>
  )
}
