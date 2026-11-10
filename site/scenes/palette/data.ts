import type { KeyboardEvent } from "react"
import { useSyncExternalStore } from "react"

// The palette's commands and live state. The query, the selection and what ran live outside the
// component files, so a query typed into one design survives every morph.

export type GroupId = "suggested" | "canvas" | "export" | "view"

export const GROUPS: readonly { readonly id: GroupId; readonly name: string }[] = [
  { id: "suggested", name: "Suggested" },
  { id: "canvas", name: "Canvas" },
  { id: "export", name: "Export" },
  { id: "view", name: "View" },
]

/** 24 × 24 stroked paths, drawn with `currentColor`. */
export const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  file: "M6.5 3h7.5l4.5 4.5V21h-12ZM14 3v4.5h4.5",
  hash: "M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15",
  frame: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 9h16M9 9v11",
  copy: "M9 9h11v11H9ZM5 15H4V4h11v1",
  grid: "M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z",
  code: "M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14",
  export: "M12 15V3M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7",
  moon: "M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z",
} as const

export type IconName = keyof typeof ICONS

export type CommandId =
  | "search-files"
  | "go-to-symbol"
  | "new-frame"
  | "duplicate"
  | "toggle-grid"
  | "copy-code"
  | "export-png"
  | "dark"

export interface Command {
  readonly id: CommandId
  readonly name: string
  readonly group: GroupId
  /** The shortcut, one keycap per entry. */
  readonly keys: readonly string[]
  readonly icon: IconName
  /** One line on what it does. */
  readonly detail: string
}

export const COMMANDS: readonly Command[] = [
  {
    id: "search-files",
    name: "Search files",
    group: "suggested",
    keys: ["⌘", "P"],
    icon: "file",
    detail: "Jump to any file in the project",
  },
  {
    id: "go-to-symbol",
    name: "Go to symbol",
    group: "suggested",
    keys: ["⌘", "⇧", "O"],
    icon: "hash",
    detail: "Components, hooks and tokens",
  },
  {
    id: "new-frame",
    name: "New frame",
    group: "canvas",
    keys: ["F"],
    icon: "frame",
    detail: "Draw a frame on the canvas",
  },
  {
    id: "duplicate",
    name: "Duplicate selection",
    group: "canvas",
    keys: ["⌘", "D"],
    icon: "copy",
    detail: "Copy in place, 8 px down",
  },
  {
    id: "toggle-grid",
    name: "Toggle grid",
    group: "canvas",
    keys: ["⌘", "'"],
    icon: "grid",
    detail: "Show or hide the layout grid",
  },
  {
    id: "copy-code",
    name: "Copy as code",
    group: "export",
    keys: ["⌘", "⇧", "C"],
    icon: "code",
    detail: "The selection as JSX and Tailwind",
  },
  {
    id: "export-png",
    name: "Export as PNG",
    group: "export",
    keys: ["⌘", "⇧", "E"],
    icon: "export",
    detail: "At 2x, on a transparent background",
  },
  {
    id: "dark",
    name: "Switch to dark",
    group: "view",
    keys: ["⌘", "⇧", "L"],
    icon: "moon",
    detail: "Or follow the system setting",
  },
]

const commandOf = (id: CommandId) => COMMANDS.find((command) => command.id === id) as Command

/** A stretch of a command's name, `hit` where the query matched it. */
export interface Segment {
  readonly text: string
  readonly hit: boolean
}

export interface Match {
  readonly command: Command
  /** The command's place in `COMMANDS`, so a ring or a grid can keep each one in its slot. */
  readonly slot: number
  readonly segments: readonly Segment[]
  readonly score: number
}

export interface Section {
  readonly group: (typeof GROUPS)[number]
  readonly matches: readonly Match[]
}

const isWordStart = (name: string, at: number) => at === 0 || name[at - 1] === " "

/**
 * Where each query character lands in `name`, case-insensitive and in order, or null on no match.
 * With `starts`, a character that does not continue a run takes the next word start when one
 * follows, so "tg" lights the T and G of "Toggle grid" rather than its first g.
 */
function positions(name: string, query: string, starts: boolean): number[] | null {
  const lower = name.toLowerCase()
  const found: number[] = []
  let from = 0
  for (const char of query) {
    let at = lower.indexOf(char, from)
    if (at === -1) return null
    if (starts && found.at(-1) !== at - 1)
      for (let look = at; look !== -1; look = lower.indexOf(char, look + 1))
        if (isWordStart(name, look)) {
          at = look
          break
        }
    found.push(at)
    from = at + 1
  }
  return found
}

function scored(name: string, query: string): { segments: Segment[]; score: number } | null {
  // Jumping to a word start can strand a later character; plain left to right never does.
  const found = positions(name, query, true) ?? positions(name, query, false)
  if (found === null) return null
  let score = -(found[0] ?? 0) * 0.1
  found.forEach((at, index) => {
    score += 1
    if (isWordStart(name, at)) score += 2
    if (found[index - 1] === at - 1) score += 3
  })
  const segments: Segment[] = []
  const hits = new Set(found)
  for (let at = 0; at < name.length; at++) {
    const hit = hits.has(at)
    const last = segments.at(-1)
    if (last?.hit === hit) segments[segments.length - 1] = { text: last.text + name[at], hit }
    else segments.push({ text: name[at] ?? "", hit })
  }
  return { segments, score }
}

/** The scope token a query may carry, as in `in:canvas dup`. */
const SCOPE = /(?:^|\s)in:(\w*)/

/** The group a query is scoped to, by a prefix of its id, and the words it searches for. */
export function parse(query: string): { readonly scope: GroupId | null; readonly words: string } {
  const token = SCOPE.exec(query)?.[1]
  const scope = token ? (GROUPS.find((group) => group.id.startsWith(token))?.id ?? null) : null
  const words = query.replace(SCOPE, " ").trim().toLowerCase().replace(/\s+/g, " ")
  return { scope, words }
}

/** `words` searched within `scope`, as a query: the token first, then the words. */
export const scoped = (words: string, scope: GroupId | null) =>
  scope === null ? words : `in:${scope} ${words}`

/**
 * The commands a query matches, grouped: groups in the order of their best match, commands by
 * score inside each. With no words, every command of the scope in its declared order.
 */
export function sectionsOf(query: string): readonly Section[] {
  const { scope, words } = parse(query)
  const matches = COMMANDS.flatMap((command, slot): Match[] => {
    if (scope !== null && command.group !== scope) return []
    const result = scored(command.name, words.replace(/ /g, ""))
    return result ? [{ command, slot, ...result }] : []
  })
  const sections = GROUPS.map((group) => ({
    group,
    matches: matches
      .filter((match) => match.command.group === group.id)
      .sort((a, b) => b.score - a.score),
  })).filter((section) => section.matches.length > 0)
  if (words === "") return sections
  const best = (section: Section) => section.matches[0]?.score ?? 0
  return sections.sort((a, b) => best(b) - best(a))
}

/** How many commands of each group a query's words match, ignoring its scope. */
export function countsOf(query: string): ReadonlyMap<GroupId | null, number> {
  const { words } = parse(query)
  const counts = new Map<GroupId | null, number>([[null, 0]])
  for (const command of COMMANDS)
    if (scored(command.name, words.replace(/ /g, "")) !== null) {
      counts.set(null, (counts.get(null) ?? 0) + 1)
      counts.set(command.group, (counts.get(command.group) ?? 0) + 1)
    }
  return counts
}

export interface Run {
  readonly id: CommandId
  /** When it ran, as `HH:MM`. */
  readonly at: string
}

interface Live {
  readonly query: string
  /** The command the arrows moved to; null follows the first match. */
  readonly selected: CommandId | null
  /** What ran, newest first. */
  readonly history: readonly Run[]
}

const FRESH: Live = {
  query: "",
  selected: null,
  history: [
    { id: "toggle-grid", at: "08:44" },
    { id: "duplicate", at: "08:41" },
    { id: "toggle-grid", at: "08:30" },
    { id: "export-png", at: "08:12" },
    { id: "duplicate", at: "08:05" },
    { id: "toggle-grid", at: "07:58" },
  ],
}

let live: Live = FRESH
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const update = (next: Partial<Live>) => {
  live = { ...live, ...next }
  for (const listener of listeners) listener()
}
const snapshot = () => live

const clock = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`

export interface Palette {
  readonly query: string
  readonly sections: readonly Section[]
  /** Every match in the order the sections show them, which is the order the arrows walk. */
  readonly matches: readonly Match[]
  readonly selected: Match | null
  readonly scope: GroupId | null
  /** The query without its scope token, as typed. */
  readonly words: string
  /** The rest of the selected command's name after the words, when the words start it. */
  readonly completion: string
  /** Commands that ran, newest first, each once. */
  readonly recent: readonly (Run & { readonly command: Command })[]
  /** How many times each command ran, and when last. */
  readonly runs: ReadonlyMap<CommandId, { readonly count: number; readonly at: string }>
  readonly last: (Run & { readonly command: Command }) | null
  readonly setQuery: (query: string) => void
  readonly setScope: (scope: GroupId | null) => void
  readonly select: (id: CommandId) => void
  readonly move: (by: number) => void
  readonly run: (id: CommandId) => void
  /** Arrows move, Enter runs, Tab completes, Escape clears and then leaves. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function usePalette(): Palette {
  const state = useSyncExternalStore(subscribe, snapshot)
  const sections = sectionsOf(state.query)
  const matches = sections.flatMap((section) => section.matches)
  const selected =
    matches.find((match) => match.command.id === state.selected) ?? matches[0] ?? null
  const { scope } = parse(state.query)
  const words = state.query.replace(SCOPE, " ").trimStart()
  const name = selected?.command.name ?? ""
  const completion =
    words.trim() !== "" && name.toLowerCase().startsWith(words.toLowerCase())
      ? name.slice(words.length)
      : ""
  const recent = state.history
    .filter((run, at) => state.history.findIndex((other) => other.id === run.id) === at)
    .map((run) => ({ ...run, command: commandOf(run.id) }))
  const runs = new Map<CommandId, { count: number; at: string }>()
  for (const run of state.history)
    runs.set(run.id, {
      count: (runs.get(run.id)?.count ?? 0) + 1,
      at: runs.get(run.id)?.at ?? run.at,
    })
  const setQuery = (query: string) => {
    update({ query, selected: null })
  }
  const move = (by: number) => {
    if (matches.length === 0) return
    const at = selected ? matches.indexOf(selected) : -1
    const next = matches[(at + by + matches.length) % matches.length]
    if (next) update({ selected: next.command.id })
  }
  const run = (id: CommandId) => {
    update({ selected: id, history: [{ id, at: clock(new Date()) }, ...live.history].slice(0, 8) })
  }
  return {
    query: state.query,
    scope,
    words,
    sections,
    matches,
    selected,
    completion,
    recent,
    runs,
    last: recent[0] ?? null,
    setQuery,
    setScope: (next) => {
      setQuery(scoped(words, next))
    },
    select: (id) => {
      if (live.selected !== id) update({ selected: id })
    },
    move,
    run,
    onKeyDown: (event) => {
      const key = event.key
      if (key === "ArrowDown" || key === "ArrowUp") move(key === "ArrowDown" ? 1 : -1)
      else if (key === "Enter" && selected) run(selected.command.id)
      else if (key === "Tab" && completion !== "") setQuery(scoped(name, scope))
      else if (key === "Escape" && state.query !== "") setQuery("")
      else if (key === "Escape") event.currentTarget.blur()
      else return
      event.preventDefault()
    },
  }
}

/**
 * Scrolls the nearest scrolling box around `row` so the row shows, without scrolling the page:
 * the version thumbnails render the same selection.
 */
export function reveal(row: HTMLElement | null) {
  if (row === null) return
  for (let box = row.parentElement; box !== null; box = box.parentElement) {
    if (box.dataset.object !== undefined) return
    const { overflowY } = getComputedStyle(box)
    if (box.scrollHeight <= box.clientHeight || !/auto|scroll/.test(overflowY)) continue
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top
    const bottom = top + row.offsetHeight
    if (top < 0) box.scrollTop += top
    else if (bottom > box.clientHeight) box.scrollTop += bottom - box.clientHeight
    return
  }
}

/** Puts the query, the selection and the history back as they were on a fresh visit. */
export const resetPalette = () => {
  update(FRESH)
}
