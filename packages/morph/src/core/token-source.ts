import parse from "postcss/lib/parse"
import type { AtRule, Container, Declaration as CssDeclaration, Rule } from "postcss"
import valueParser from "postcss-value-parser"

import {
  type BlockId,
  type Declaration,
  type ThemeModel,
  type TokenFile,
  type TokenName,
} from "./design-system"
import { isTokenName, normalizeValue } from "./css-value"

/** Exclusive offsets into the original source, including its BOM when present. */
export interface SourceSpan {
  readonly start: number
  readonly end: number
}
/** One exact custom-property declaration and its writable value. */
export interface SourceDeclaration {
  readonly name: TokenName
  readonly value: string
  readonly span: SourceSpan
}
/** A classified token block, excluding conditional rules and nested keyframes. */
export interface TokenBlock {
  readonly id: BlockId
  readonly theme: Declaration["theme"]
  readonly declarations: readonly SourceDeclaration[]
  readonly resets: readonly string[]
  readonly insertion: number
  readonly terminator: number | null
  readonly indent: string
}
/** Original text and the only blocks the graph and editor may consume. */
export interface TokenSource {
  readonly file: TokenFile
  readonly blocks: readonly TokenBlock[]
}
/** Replacements address the winning declaration; insertions address a classified block. */
export type SourceChange =
  | { kind: "replace"; declaration: SourceDeclaration; to: string }
  | { kind: "insert"; block: TokenBlock; token: TokenName; to: string }

/** Parses source once for graph construction and exact subsequent edits. */
export function parseTokenSource(file: TokenFile, themes: ThemeModel): TokenSource {
  const root = parse(file.css, { from: file.path, map: false })
  const bom = file.css.startsWith("\uFEFF") ? 1 : 0
  const blocks: TokenBlock[] = []
  const offset = (position: { offset?: number } | undefined) => {
    if (position?.offset === undefined) throw new Error(`Missing parser offset in ${file.path}`)
    return position.offset + bom
  }
  const declaration = (node: CssDeclaration): SourceDeclaration | null => {
    if (!isTokenName(node.prop)) return null
    const raw = node.raws.value?.raw ?? node.value
    const significant = valueParser(raw).nodes.filter(
      (part) => part.type !== "space" && part.type !== "comment",
    )
    const start = offset(node.source?.start) + node.prop.length + (node.raws.between ?? ":").length
    const first = significant[0]
    const last = significant.at(-1)
    return {
      name: node.prop,
      value: normalizeValue(node.value),
      span: {
        start: start + (first?.sourceIndex ?? 0),
        end: start + (last?.sourceEndIndex ?? 0),
      },
    }
  }
  const add = (node: Rule | AtRule, id: BlockId, theme: Declaration["theme"]) => {
    const nodes = node.nodes ?? []
    const close = offset(node.source?.end) - 1
    const before = file.css.slice(0, close)
    const insertion = before.trimEnd().length
    const last = nodes.filter((child) => child.type !== "comment").at(-1)
    const lastEnd = last?.type === "decl" ? offset(last.source?.end) : null
    const terminator = lastEnd !== null && file.css[lastEnd - 1] !== ";" ? lastEnd : null
    blocks.push({
      id,
      theme,
      insertion,
      terminator,
      indent:
        nodes
          .map((child) => /(?:\r?\n)([\t ]+)\S?$/.exec(child.raws.before ?? "")?.[1])
          .find((indent) => indent !== undefined) ?? "  ",
      declarations: nodes.flatMap((child) => {
        const found = child.type === "decl" ? declaration(child) : null
        return found === null ? [] : [found]
      }),
      resets:
        theme === "app"
          ? nodes.flatMap((child) =>
              child.type === "decl" &&
              /^--[\w-]*\*$/.test(child.prop) &&
              child.value.trim() === "initial"
                ? [child.prop.slice(0, -1)]
                : [],
            )
          : [],
    })
  }
  const visit = (container: Container) => {
    for (const node of container.nodes ?? []) {
      if (node.type === "atrule" && node.name === "layer") visit(node)
      else if (node.type === "atrule" && node.name === "theme") {
        const words = node.params.split(/\s+/)
        if (!words.includes("reference"))
          add(node, "shared", words.includes("default") ? "default" : "app")
      } else if (node.type === "rule") {
        const block = themes.blockOf(node.selector)
        if (block !== undefined) {
          add(node, block, "none")
          for (const child of node.nodes)
            if (child.type === "atrule" && child.name === "theme") {
              const words = child.params.split(/\s+/)
              if (!words.includes("reference"))
                add(child, "shared", words.includes("default") ? "default" : "app")
            }
        }
      }
    }
  }
  if (root.type === "document") for (const child of root.nodes) visit(child)
  else visit(root)
  return { file, blocks }
}

/** Patches original spans, preserving comments, formatting, and unrelated declarations. */
export function rewriteTokenSource(source: TokenSource, changes: readonly SourceChange[]): string {
  const patches: { start: number; end: number; text: string }[] = []
  const inserted = new Map<TokenBlock, Extract<SourceChange, { kind: "insert" }>[]>()
  for (const change of changes) {
    if (change.kind === "replace") patches.push({ ...change.declaration.span, text: change.to })
    else inserted.set(change.block, [...(inserted.get(change.block) ?? []), change])
  }
  const newline = source.file.css.includes("\r\n") ? "\r\n" : "\n"
  for (const [block, entries] of inserted) {
    if (block.terminator !== null)
      patches.push({ start: block.terminator, end: block.terminator, text: ";" })
    patches.push({
      start: block.insertion,
      end: block.insertion,
      text: entries
        .map((entry) => `${newline}${block.indent}${entry.token}: ${entry.to};`)
        .join(""),
    })
  }
  // Equal-offset insertions preserve the terminator before the new declarations.
  const merged = new Map<string, { start: number; end: number; text: string }>()
  for (const patch of patches) {
    const key = `${patch.start}:${patch.end}`
    const previous = merged.get(key)
    merged.set(key, previous === undefined ? patch : { ...patch, text: previous.text + patch.text })
  }
  let css = source.file.css
  for (const patch of [...merged.values()].sort((a, b) => b.start - a.start))
    css = css.slice(0, patch.start) + patch.text + css.slice(patch.end)
  return css
}
