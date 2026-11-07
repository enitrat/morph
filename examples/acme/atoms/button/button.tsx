import { type ReactNode } from "react"

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  onClick?: () => void
  children?: ReactNode
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
  sm: "h-(--button-h-sm) px-(--button-px-sm) text-sm",
  md: "h-(--button-h-md) px-(--button-px-md) text-sm",
  lg: "h-(--button-h-lg) px-(--button-px-lg) text-base",
}

export function Button({
  variant = "primary",
  size = "md",
  disabled,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-(--button-gap) rounded-(--button-radius) font-medium disabled:bg-(--button-bg-disabled) disabled:text-(--button-fg-disabled) ${VARIANT[variant]} ${SIZE[size]}`}
    >
      {children}
    </button>
  )
}
