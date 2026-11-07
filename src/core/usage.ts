import { type TokenName } from "./design-system"

const UTILITY =
  "(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|decoration|caret|accent|placeholder|shadow)"

const VARIABLE = /\((--[\w-]+)/g

// Lookaheads, so a utility nested in another (`text-border-secondary`) is read too, and both
// readings of a side utility (`border-t-x` as role `x` or role `t-x`) count.
const ROLE_UTILITIES = [
  new RegExp(String.raw`\b(?=${UTILITY}-([\w-]+))`, "g"),
  /\b(?=border-[trblxyse]-([\w-]+))/g,
]

/**
 * Every ds token a component's sources read: `var(--x)`, `(--x)`, and `--color-<role>` for each
 * Tailwind utility of a role (`bg-secondary` reads `--color-secondary`). Names the graph does not
 * hold are harmless: a reader only asks about tokens it knows.
 */
export function tokensReadIn(source: string): TokenName[] {
  const names = new Set<TokenName>()
  for (const [, name = ""] of source.matchAll(VARIABLE)) names.add(name as TokenName)
  for (const pattern of ROLE_UTILITIES) {
    for (const [, role = ""] of source.matchAll(pattern)) names.add(`--color-${role}`)
  }
  return [...names]
}
