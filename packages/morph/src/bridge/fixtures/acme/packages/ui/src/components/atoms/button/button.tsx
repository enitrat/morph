export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
  press?: "scale" | "morph"
  loading?: boolean
  disabled?: boolean
  children?: unknown
}

const VARIANT = {
  primary:
    "bg-(--button-primary-bg) text-(--button-primary-fg) hover:bg-(--button-primary-bg-hover)",
  secondary:
    "bg-(--button-secondary-bg) text-(--button-secondary-fg) hover:bg-(--button-secondary-bg-hover)",
  outline:
    "border border-(--button-outline-border) bg-(--button-outline-bg) text-(--button-outline-fg)",
  ghost: "bg-(--button-ghost-bg) text-(--button-ghost-fg) hover:bg-(--button-ghost-bg-hover)",
  destructive: "bg-(--button-destructive-bg) text-(--button-destructive-fg)",
}

const SIZE = {
  sm: "h-(--button-h-sm) px-(--button-px-sm)",
  md: "h-(--button-h-md) px-(--button-px-md)",
  lg: "h-(--button-h-lg) px-(--button-px-lg)",
}

export function Button({ variant = "primary", size = "md", disabled, children }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`gap-(--button-gap) rounded-(--button-radius) disabled:bg-(--button-bg-disabled) disabled:text-(--button-fg-disabled) ${VARIANT[variant]} ${SIZE[size]}`}
    >
      {children}
    </button>
  )
}
