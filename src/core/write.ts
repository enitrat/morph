import { normalizeSelector } from "./config"
import { type BlockId, declarationFor, type Declaration, type Tokens } from "./design-system"
import { assertEdits, type TokenEdit } from "./edit"
import { nodeOf, normalizeValue } from "./graph"

interface LineChange {
  file: string
  token: string
  block: BlockId
  from: string | undefined
  to: string
}

interface BlockSpan {
  bodyStart: number
  bodyEnd: number
}

/** Every block of this kind in the file: a file may open one theme's block more than once. */
function findBlocks(css: string, tokens: Tokens, block: BlockId): BlockSpan[] {
  const selectors = tokens.themes.selectorsOf(block)
  const spans: BlockSpan[] = []
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = normalizeSelector((match[1] ?? "").replaceAll(/\/\*[\s\S]*?\*\//g, ""))
    const theme = block === "shared" && /^@theme\b/.test(selector)
    if (!theme && !selectors.includes(selector)) continue
    const bodyStart = match.index + (match[1] ?? "").length + 1
    spans.push({ bodyStart, bodyEnd: bodyStart + (match[2] ?? "").length })
  }
  if (spans.length === 0) throw new Error(`no ${block} block`)
  return spans
}

const escape = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

function replaceIn(css: string, tokens: Tokens, change: LineChange): string {
  const { block, token, to } = change
  const pattern = new RegExp(`(${escape(token)}\\s*:\\s*)([^;]+)(;)`)
  const span = findBlocks(css, tokens, block).find((candidate) =>
    pattern.test(css.slice(candidate.bodyStart, candidate.bodyEnd)),
  )
  if (!span) throw new Error(`${token} is not declared in the ${block} block`)
  const body = css.slice(span.bodyStart, span.bodyEnd)
  const next = body.replace(pattern, (_, head: string, __, tail: string) => `${head}${to}${tail}`)
  return css.slice(0, span.bodyStart) + next + css.slice(span.bodyEnd)
}

function insertIn(css: string, tokens: Tokens, change: LineChange): string {
  const [span] = findBlocks(css, tokens, change.block)
  if (!span) throw new Error(`no ${change.block} block`)
  const body = css.slice(span.bodyStart, span.bodyEnd)
  const indent = /\n([ \t]+)--/.exec(body)?.[1] ?? "  "
  const trimmed = body.replace(/\s*$/, "")
  const closing = body.slice(trimmed.length)
  const next = `${trimmed}\n${indent}${change.token}: ${change.to};${closing}`
  return css.slice(0, span.bodyStart) + next + css.slice(span.bodyEnd)
}

/**
 * The plan for one edit, as line changes: which declaration each theme's value lands in. A theme
 * edit first pins, at its current value, every other theme that reads the edited block because it
 * declares nothing of its own before it: a light edit pins a dark that inherits from light.
 */
function planEdit(tokens: Tokens, edit: TokenEdit): LineChange[] {
  const node = nodeOf(tokens.graph, edit.token)
  const change = (declaration: Declaration, to: string): LineChange => ({
    file: declaration.file,
    token: edit.token,
    block: declaration.block,
    from: declaration.value,
    to,
  })
  if (edit.scope === "all") return node.declarations.map((entry) => change(entry, edit.to))
  const { scope: theme } = edit
  const declares = (block: BlockId) => node.declarations.some((entry) => entry.block === block)
  const own = node.declarations.find((entry) => entry.block === theme)
  const read = own ?? declarationFor(tokens, node, theme)
  const pins = tokens.themes.list.flatMap((other): LineChange[] => {
    const at = other.reads.indexOf(theme)
    if (other.name === theme || at === -1 || other.reads.slice(0, at).some(declares)) return []
    const { value } = declarationFor(tokens, node, other.name)
    return [{ file: read.file, token: edit.token, block: other.name, from: undefined, to: value }]
  })
  const edited: LineChange = own
    ? change(own, edit.to)
    : { file: read.file, token: edit.token, block: theme, from: undefined, to: edit.to }
  return [...pins, edited]
}

/** `tokens` with one line change applied, as rebuilding them from the written file would read. */
function withChange(tokens: Tokens, change: LineChange): Tokens {
  const node = nodeOf(tokens.graph, change.token)
  const before = node.declarations.find((entry) => entry.block === change.block)
  const declaration: Declaration = {
    file: change.file,
    block: change.block,
    value: normalizeValue(change.to),
    theme: before?.theme ?? "none",
  }
  const others = node.declarations.filter((entry) => entry.block !== change.block)
  const graph = new Map(tokens.graph).set(node.name, {
    ...node,
    declarations: [...others, declaration],
  })
  return { ...tokens, graph }
}

/**
 * The line changes `edits` write, each edit planned against the tokens the edits before it left,
 * so a light and a dark edit of a token with no `.dark` declaration add that declaration once.
 * Two changes of one declaration merge into one, from the code's value to the last.
 */
function planEdits(
  tokens: Tokens,
  edits: readonly TokenEdit[],
): { tokens: Tokens; changes: LineChange[] } {
  let next = tokens
  const changes: LineChange[] = []
  for (const edit of edits) {
    for (const change of planEdit(next, edit)) {
      next = withChange(next, change)
      const at = changes.findIndex(
        (entry) =>
          entry.file === change.file &&
          entry.token === change.token &&
          entry.block === change.block,
      )
      const earlier = changes[at]
      if (earlier) changes[at] = { ...earlier, to: change.to }
      else changes.push(change)
    }
  }
  return { tokens: next, changes }
}

/** The tokens as they read with `edits` applied, declaration by declaration, as they are written. */
export function withEdits(tokens: Tokens, edits: readonly TokenEdit[]): Tokens {
  return edits.length === 0 ? tokens : planEdits(tokens, edits).tokens
}

/** The files `edits` rewrite, with their new contents, and the line changes behind them. */
export function applyEdits(
  tokens: Tokens,
  edits: readonly TokenEdit[],
): { files: Map<string, string>; changes: LineChange[] } {
  assertEdits(tokens, edits)
  const read = new Map(tokens.files.map((file) => [file.path, file.css]))
  const out = new Map<string, string>()
  const { changes } = planEdits(tokens, edits)
  for (const change of changes) {
    const css = out.get(change.file) ?? read.get(change.file)
    if (css === undefined) throw new Error(`${change.file} was not read`)
    out.set(
      change.file,
      change.from === undefined ? insertIn(css, tokens, change) : replaceIn(css, tokens, change),
    )
  }
  return { files: out, changes }
}
