import { type RootState } from "./config"
import { type Theme, type ThemeModel } from "./design-system"
import { type TokenEdit } from "./edit"

/** Where a preview applies: the whole page, or only under the elements `within` selects. */
export type PreviewScope = "page" | { within: string }

/** `[data-theme='claude'].dark`; empty for the bare root. */
const compound = (state: RootState) =>
  [
    ...Object.entries(state.attributes).map(([name, value]) => `[${name}='${value}']`),
    ...state.classes.map((name) => `.${name}`),
  ].join("")

const size = (state: RootState) => state.classes.length + Object.keys(state.attributes).length

/** Whether `wider` requires everything `state` does, and more. */
const widens = (wider: RootState, state: RootState) =>
  size(wider) > size(state) &&
  state.classes.every((name) => wider.classes.includes(name)) &&
  Object.entries(state.attributes).every(([name, value]) => wider.attributes[name] === value)

/**
 * The selectors that show `theme`'s value, each one excluding the other themes that require more
 * of the same element: a light edit stays off a `.dark` root, a claude edit off `claude.dark`.
 */
function themeSelectors(themes: ThemeModel, theme: Theme, scope: PreviewScope): string[] {
  const others = themes.list.filter((other) => other.name !== theme.name)
  const excluding = (state: RootState) =>
    others
      .flatMap((other) => other.activations.filter((wider) => widens(wider, state)))
      .map((wider) => `:not(${compound(wider)})`)
      .join("")
  const own = theme.activations.map((state) => ({
    state,
    at: `${compound(state)}${excluding(state)}`,
  }))
  const named = own.filter(({ state }) => size(state) > 0)
  if (scope === "page") return own.map(({ state, at }) => (size(state) === 0 ? `:root${at}` : at))
  const { within } = scope
  const elsewhere = others
    .flatMap((other) => other.activations.filter((state) => size(state) > 0))
    .map((state) => `:not(${compound(state)})`)
    .join("")
  const fromRoot = own
    .filter(({ state }) => !theme.activations.some((narrower) => widens(state, narrower)))
    .map(({ at }) => `:root${at} ${within}${elsewhere}`)
  return [
    ...named.map(({ at }) => `${within}${at}`),
    ...fromRoot,
    ...named.map(({ at }) => `${within} ${at}`),
  ]
}

/**
 * Under `within`, a stage takes its theme from its own root state, else from `<html>`'s, and an
 * element inside it from a nested one. A stage pinned to one theme ignores the others' edits.
 */
function selectorsOf(themes: ThemeModel, edit: TokenEdit, scope: PreviewScope): string[] {
  if (edit.scope !== "all") {
    const theme = themes.list.find((entry) => entry.name === edit.scope)
    if (theme === undefined) throw new Error(`${edit.scope} is not a theme`)
    return themeSelectors(themes, theme, scope)
  }
  const named = themes.list.flatMap((theme) =>
    theme.activations.filter((state) => size(state) > 0).map(compound),
  )
  if (scope === "page") return [...new Set([":root", ...named])]
  return [scope.within, ...new Set(named.map((at) => `${scope.within} ${at}`))]
}

export function previewCss(
  themes: ThemeModel,
  edits: readonly TokenEdit[],
  scope: PreviewScope,
): string {
  return edits
    .map(
      (edit) =>
        `${selectorsOf(themes, edit, scope).join(", ")} { ${edit.token}: ${edit.to} !important; }`,
    )
    .join("\n")
}
