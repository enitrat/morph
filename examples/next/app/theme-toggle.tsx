"use client"

import { Button } from "acme"

export function ThemeToggle() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => document.documentElement.classList.toggle("dark")}
    >
      Toggle theme
    </Button>
  )
}
