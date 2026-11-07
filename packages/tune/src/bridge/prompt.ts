import { z } from "zod"

import { type Anchor, type Ask, Direction, type Mark, type Parent } from "../variant/model"

interface DesignRules {
  /** Each specifier the agent may import components from, with the React names it imports. */
  imports: readonly { specifier: string; names: readonly string[] }[]
  styleRules: readonly string[]
}

export const Directions = (count: number) =>
  z.object({ directions: z.array(Direction).length(count) })

export const Outcome = z.object({
  title: z.string().min(1).describe("At most six words naming what this variant changes."),
  summary: z
    .string()
    .min(1)
    .describe(
      "One sentence on what a designer sees change, without class, token or file names, naming any [placeholder] text and any label, value or link that moved or merged.",
    ),
})
export type Outcome = z.infer<typeof Outcome>

const anchor = ({ source, owner, text }: Anchor) =>
  `${source.path}:${source.line}:${source.col} (rendered by ${owner.join(" < ") || "?"}${
    text === "" ? "" : `, text "${text.slice(0, 80)}"`
  })`

function markLine(entry: Mark): string {
  if (entry.kind === "box") return `Box ${entry.place} ${anchor(entry.at)}: ${entry.label}`
  if (entry.kind === "arrow")
    return `Arrow: move ${anchor(entry.from)} ${entry.place} ${anchor(entry.to)}`
  return `Note on ${anchor(entry.at)}: ${entry.text}`
}

const mark = (entry: Mark, index: number) => `${index + 1}. ${markLine(entry)}`

/** Each kept round, oldest first: what was asked, and the variant the designer kept. */
function rounds(parent: Parent | null): string[] {
  if (parent === null) return []
  return [
    ...rounds(parent.parent),
    `- Asked: ${parent.words}`,
    `  Kept "${parent.title}": ${parent.summary}`,
  ]
}

function request(ask: Ask, parent: Parent | null): string {
  const words =
    parent === null
      ? [`The designer's words: ${ask.words}`]
      : [
          "The designer is refining a variant they kept. Earlier rounds:",
          ...rounds(parent),
          "",
          "The code as it is already contains the kept variant.",
          `Their feedback on "${parent.title}": ${ask.words}`,
        ]
  return [
    ...words,
    "",
    "Elements they pointed at (file:line:col of their JSX):",
    ...ask.targets.map((target) => `- ${anchor(target)}`),
    ...(ask.marks.length === 0 ? [] : ["", "Their sketch marks:", ...ask.marks.map(mark)]),
  ].join("\n")
}

const DISTINCT = [
  "Each must satisfy the request and differ from the others in layout or hierarchy, not only in",
  "wording or spacing.",
]

const CLOSE = [
  "Each starts from the code as it is, applies the feedback and keeps everything else. They stay",
  "close to each other and differ only in how they apply the feedback.",
]

export function plannerPrompt(ask: Ask, parent: Parent | null): string {
  return [
    "A designer wants a change to a React UI. Propose distinct ways to make it.",
    "",
    request(ask, parent),
    "",
    `Answer with exactly ${ask.count} directions.`,
    ...(parent === null ? DISTINCT : CLOSE),
    "Give each a title of at most six",
    "words a designer scans at a glance, and a description of one short sentence. Name what the",
    "designer sees change, never how the code does it: no CSS, class, token, prop or file names.",
  ].join("\n")
}

export function variantPrompt(
  ask: Ask,
  parent: Parent | null,
  direction: Direction,
  rules: DesignRules,
): string {
  return [
    "You are editing a git checkout of a React project in your working directory.",
    "Make one design change in its source, then stop.",
    "",
    request(ask, parent),
    "",
    `Your direction: ${direction.title}. ${direction.description}`,
    "",
    "Rules:",
    parent === null
      ? "- Start from the files above. Change only what the request needs."
      : "- Start from the files above as they are: they hold the kept variant. Apply the feedback\n  and keep everything else.",
    ...(rules.imports.length === 0
      ? []
      : [
          `- Build UI only from ${rules.imports.map(({ specifier, names }) => `${specifier} components: ${names.join(", ")}`).join("; ")}.`,
        ]),
    ...rules.styleRules.map((rule) => `- ${rule}`),
    "- Never put an interactive element (button, link, input, popover trigger) inside a link or a",
    "  button. Restructure so they are siblings.",
    "- Render only the new layout. Do not keep the old one hidden or behind a prop.",
    "- Keep every piece of content the target shows (labels, values, links) unless the request",
    "  removes it. If you move or merge any, say where in your summary.",
    "- Never invent product facts, numbers, durations, rates or links. Reuse a string the codebase",
    '  already has, or write an obvious placeholder in brackets, such as "[Notice text]", and name',
    "  each placeholder in your summary.",
    "- Never add a package. Import only what the file's workspace already depends on, and build",
    `  any effect from ${[...rules.imports.map(({ specifier }) => specifier), "the code already there"].join(" and ")}. Never touch package.json, a`,
    "  lockfile, tsconfig or next config, and never write a .d.ts file or a `declare module`. A",
    "  change that does any of these is refused. When the request names a package, start your",
    '  summary with "Built without <package>: variants can\'t add packages."',
    "- You cannot run commands. Formatting, lint and typecheck run after you finish.",
  ].join("\n")
}

export function retryPrompt(first: string, errors: string): string {
  return [
    first,
    "",
    "You already made this change in the working directory. These checks fail on it now:",
    "",
    errors,
    "",
    "Fix them in place, keeping the design.",
  ].join("\n")
}
