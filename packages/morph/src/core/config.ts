import { z } from "zod"

/** A repo-relative glob, matched server-side only. */
const Glob = z.string().min(1)

/**
 * `[data-theme="x"] , .dark` → `[data-theme='x'],.dark`: whitespace only where it is a descendant
 * combinator, quotes single, so two spellings of one selector compare equal.
 */
export function normalizeSelector(selector: string): string {
  return selector
    .replaceAll('"', "'")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([,>+~()])\s*/g, "$1")
    .trim()
}

const Selector = z.string().min(1).transform(normalizeSelector)

/** `all` is the edit scope that writes every theme and `shared` the block they all read. */
export const ThemeName = z
  .string()
  .regex(/^[a-z][\w-]*$/)
  .refine((name) => name !== "all" && name !== "shared", "no theme is named all or shared")
  .brand<"ThemeName">()
export type ThemeName = z.infer<typeof ThemeName>

/** What `<html>` carries while a theme shows: classes, and attributes with their values. */
export interface RootState {
  classes: readonly string[]
  attributes: Readonly<Record<string, string>>
}

/** Splits a selector list at its top-level commas. */
export const alternativesOf = (selector: string): string[] => {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < selector.length; at++) {
    const char = selector[at]
    if (char === "(" || char === "[") depth++
    else if (char === ")" || char === "]") depth--
    else if (char === "," && depth === 0) {
      out.push(selector.slice(start, at))
      start = at + 1
    }
  }
  return [...out, selector.slice(start)]
}

const ROOT_STATE = /^(?::root|html)?((?:\.[\w-]+|\[[\w-]+='[^']*'\])*)$/

/**
 * The root state one normalized selector alternative requires: `:root` needs nothing, `.dark` the
 * class, `[data-theme='claude'].dark` both. `undefined` when it does not describe `<html>` alone.
 */
export function rootStateOf(alternative: string): RootState | undefined {
  const match = ROOT_STATE.exec(alternative)
  if (match === null || alternative === "") return undefined
  const parts = match[1] ?? ""
  return {
    classes: [...parts.matchAll(/\.([\w-]+)/g)].map(([, name = ""]) => name),
    attributes: Object.fromEntries(
      [...parts.matchAll(/\[([\w-]+)='([^']*)'\]/g)].map(([, name = "", value = ""]) => [
        name,
        value,
      ]),
    ),
  }
}

const ThemeDef = z.object({
  name: ThemeName,
  /** Every selector whose block holds this theme's values. */
  selectors: z.array(Selector).min(1),
  /** The theme this one reads where it declares nothing itself: dark reads light. */
  fallback: ThemeName.optional(),
})

export const Tier = z.enum(["primitive", "semantic", "component"])
export type Tier = z.infer<typeof Tier>

const Themes = z
  .object({
    /** Blocks every theme reads, besides `@theme` blocks, which are always shared. */
    shared: z.array(Selector),
    /** The first theme is the reference one: scales resolve in it. */
    list: z.array(ThemeDef).min(1),
  })
  .superRefine(({ shared, list }, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: "custom", message })
    }
    const names = new Set<string>()
    const owner = new Map(shared.map((selector) => [selector, "shared"]))
    for (const theme of list) {
      if (names.has(theme.name)) issue(`theme ${theme.name} is listed twice`)
      names.add(theme.name)
      for (const selector of theme.selectors) {
        const taken = owner.get(selector)
        if (taken !== undefined) issue(`${selector} is in both ${taken} and ${theme.name}`)
        owner.set(selector, theme.name)
        if (alternativesOf(selector).some((part) => rootStateOf(part) === undefined))
          issue(`theme ${theme.name}: ${selector} does not select <html> by class or attribute`)
      }
    }
    const fallbackOf = new Map(list.map((theme) => [theme.name as string, theme.fallback]))
    for (const theme of list) {
      const seen = new Set<string>([theme.name])
      for (let next = theme.fallback; next !== undefined; next = fallbackOf.get(next)) {
        if (!names.has(next)) {
          issue(`theme ${theme.name} falls back to ${next}, which is not listed`)
          break
        }
        if (seen.has(next)) {
          issue(`theme ${theme.name} falls back to itself through ${next}`)
          break
        }
        seen.add(next)
      }
    }
  })
export type ThemesConfig = z.infer<typeof Themes>

/** The supported CSS token source and its theme configuration. */
export const CssTokens = z.object({
  kind: z.literal("css"),
  /** Ordered: an earlier file wins a block both declare. Each glob's matches are sorted. */
  files: z.array(Glob).min(1),
  /** First match wins; a file no rule matches is semantic. */
  tiers: z.array(z.object({ files: Glob, tier: Tier.exclude(["semantic"]) })).default([]),
  themes: Themes,
})

export const Naming = z.enum(["own", "container", "nearest"])
export type Naming = z.infer<typeof Naming>

const ComponentCommon = {
  /** Free label shown on impact rows: `atom`, `block`, `ui`. */
  group: z.string().min(1).default("ui"),
  /**
   * How a pointed element is named by one of these components: `own` when the element is its
   * root (an atom); `container` when the element is anywhere inside it (a block); `nearest` only
   * when no `own` or `container` component claims the element and it is the nearest listed one.
   */
  naming: Naming.default("own"),
  /** Lab page with `{slug}`, or null when the app has no catalogue. */
  href: z.string().includes("{slug}").nullable().default(null),
  /** The specifier callers import it by, `{slug}` allowed; null: never offered to the agent. */
  importFrom: z.string().min(1).nullable(),
}

const ComponentSource = z.discriminatedUnion("kind", [
  /** One folder per component, found by its lab meta: the folder's `.tsx` and `.tokens.css`. */
  z.object({
    kind: z.literal("lab-meta"),
    meta: Glob,
    ...ComponentCommon,
    props: z.enum(["lab-meta", "cva", "none"]).default("lab-meta"),
  }),
  /** One file per component, as shadcn's `components/ui/*.tsx`. */
  z.object({
    kind: z.literal("files"),
    files: Glob,
    ...ComponentCommon,
    props: z.enum(["cva", "none"]).default("cva"),
  }),
])
export type ComponentSource = z.infer<typeof ComponentSource>

const Command = z.object({ bin: z.string().regex(/^[\w.-]+$/), args: z.array(z.string()) })
export type Command = z.infer<typeof Command>

/** A path prefix, minus paths containing any `except` fragment. */
const PathRule = z.object({ prefix: z.string().min(1), except: z.array(z.string()).default([]) })
export type PathRule = z.infer<typeof PathRule>

export const MorphConfig = z.object({
  /** Base for input paths; normalized configurations use repo-relative paths. */
  pathBase: z.enum(["app", "repo"]).default("app"),
  /** App directory relative to the Git root, populated by the bridge. */
  appRoot: z
    .string()
    .refine(
      (path) =>
        path === "" ||
        (!path.startsWith("/") &&
          !path.includes("\\") &&
          path.split("/").every((part) => part !== "" && part !== "." && part !== "..")),
      "appRoot must be Git-relative",
    )
    .default(""),
  tokens: CssTokens,
  components: z.array(ComponentSource),
  /** Project-specific styling instructions supplied to the variant agent. */
  styleRules: z
    .array(z.string().min(1))
    .default([
      "Style with the Tailwind utilities and ds tokens the code already uses. Never add a colour, a token, or an arbitrary value.",
    ]),
  /** Call sites here are rarely what a designer means when picking an element. */
  plumbing: z.array(PathRule).default([]),
  checks: z.object({
    lint: Command.nullable(),
    /** Dial and prop writes format the file they touch. */
    format: Command,
    /** `workspace`: once per workspace a change reaches; `root`: once at the repo root; `app`: once at the app root. */
    typecheck: Command.extend({ scope: z.enum(["workspace", "root", "app"]) }),
  }),
})
export type MorphConfig = z.infer<typeof MorphConfig>
export const MorphConfigInputSchema = MorphConfig.omit({ appRoot: true })
export type MorphConfigInput = z.input<typeof MorphConfigInputSchema>
