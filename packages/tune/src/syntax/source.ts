import { parse } from "@babel/parser"
import type * as t from "@babel/types"

function source(text: string): t.File | undefined {
  try {
    return parse(text, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] })
  } catch {
    return undefined
  }
}

function isNode(value: unknown): value is t.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  )
}

function walk(root: t.Node): t.Node[] {
  return [
    root,
    ...Object.entries(root).flatMap(([key, value]) => {
      if (key === "loc" || key === "comments" || key.endsWith("Comments")) return []
      const values: unknown[] = Array.isArray(value) ? value : [value]
      return values.filter(isNode).flatMap(walk)
    }),
  ]
}

function nameOf(value: t.Node | null | undefined): string | undefined {
  if (value?.type === "Identifier" || value?.type === "JSXIdentifier") return value.name
  if (value?.type === "StringLiteral") return value.value
  if (value?.type === "NumericLiteral") return String(value.value)
  return undefined
}
const upper = (name: string | undefined): name is string =>
  name !== undefined && /^[A-Z]/.test(name)

/** Value exports and imported names, retaining exported names for aliases. */
export function moduleNames(
  text: string,
  specifiers: ReadonlySet<string>,
): { exports: string[]; namedExports: string[]; imports: string[] } {
  const root = source(text)
  const exports: string[] = []
  const namedExports: string[] = []
  const imports: string[] = []
  for (const statement of root?.program.body ?? []) {
    if (
      statement.type === "ImportDeclaration" &&
      statement.importKind !== "type" &&
      (specifiers.has(statement.source.value) || statement.source.value.startsWith("."))
    ) {
      for (const item of statement.specifiers)
        if (item.type === "ImportSpecifier" && item.importKind !== "type") {
          const name = nameOf(item.imported)
          if (name) imports.push(name)
        }
    }
    if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
      const declaration = statement.declaration
      const candidates =
        declaration?.type === "VariableDeclaration"
          ? declaration.declarations.map((item) => item.id)
          : declaration && "id" in declaration
            ? [declaration.id]
            : []
      for (const candidate of candidates) {
        const name = nameOf(candidate)
        if (upper(name)) {
          exports.push(name)
          namedExports.push(name)
        }
      }
      for (const item of statement.specifiers) {
        if (item.type !== "ExportSpecifier" || item.exportKind === "type") continue
        const exported = nameOf(item.exported)
        const name = exported === "default" ? nameOf(item.local) : exported
        if (upper(name)) {
          exports.push(name)
          if (exported !== "default") namedExports.push(name)
        }
      }
    }
    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = statement.declaration
      const name = nameOf(
        declaration.type === "Identifier"
          ? declaration
          : "id" in declaration
            ? declaration.id
            : undefined,
      )
      if (upper(name)) exports.push(name)
    }
  }
  return {
    exports: [...new Set(exports)],
    namedExports: [...new Set(namedExports)],
    imports,
  }
}

function properties(object: t.Node | undefined): [string, t.Expression | t.PatternLike][] {
  if (object?.type !== "ObjectExpression") return []
  return object.properties.flatMap((property): [string, t.Expression | t.PatternLike][] => {
    if (property.type !== "ObjectProperty") return []
    if (
      property.computed &&
      property.key.type !== "StringLiteral" &&
      property.key.type !== "NumericLiteral"
    )
      return []
    const key = nameOf(property.key)
    return key ? [[key, property.value]] : []
  })
}

/** Literal CVA variants and defaults referenced by a component's VariantProps. */
export function cvaVariants(
  text: string,
  component: string,
): { name: string; options: string[]; fallback: string }[] {
  const root = source(text)
  if (!root) return []
  const all = walk(root)
  const alias = root.program.body.flatMap((statement) =>
    statement.type === "ExportNamedDeclaration"
      ? statement.specifiers.filter(
          (item): item is t.ExportSpecifier =>
            item.type === "ExportSpecifier" && nameOf(item.exported) === component,
        )
      : [],
  )[0]
  const localName = alias ? (nameOf(alias.local) ?? component) : component
  const declaration = all.find(
    (item) =>
      (item.type === "FunctionDeclaration" || item.type === "VariableDeclarator") &&
      nameOf(item.id) === localName,
  )
  if (!declaration) return []
  const refs = walk(declaration).filter(
    (item): item is t.TSTypeReference =>
      item.type === "TSTypeReference" && nameOf(item.typeName) === "VariantProps",
  )
  const variant = refs
    .flatMap(walk)
    .find((item): item is t.TSTypeQuery => item.type === "TSTypeQuery")
  const variantName = nameOf(variant?.exprName)
  const variable = all.find(
    (item): item is t.VariableDeclarator =>
      item.type === "VariableDeclarator" && nameOf(item.id) === variantName,
  )
  const call = variable?.init
  if (call?.type !== "CallExpression") return []
  const cvaNames = new Set(["cva"])
  for (const item of all)
    if (item.type === "ImportSpecifier" && nameOf(item.imported) === "cva")
      cvaNames.add(item.local.name)
  if (!cvaNames.has(nameOf(call.callee) ?? "")) return []
  const config = call.arguments.find((item) => item.type === "ObjectExpression")
  const entries = new Map(properties(config))
  const defaults = new Map(
    properties(entries.get("defaultVariants")).flatMap(([key, value]): [string, string][] =>
      value.type === "StringLiteral" ||
      value.type === "BooleanLiteral" ||
      value.type === "NumericLiteral"
        ? [[key, String(value.value)]]
        : [],
    ),
  )
  return properties(entries.get("variants")).flatMap(([name, value]) => {
    const fallback = defaults.get(name)
    return fallback === undefined || value.type !== "ObjectExpression"
      ? []
      : [{ name, options: properties(value).map(([key]) => key), fallback }]
  })
}

type Span = { start: number; end: number }
type Attribute = Span & {
  name?: string
  value?: { kind: "literal"; value: string | boolean } | { kind: "forward" | "code" }
}
type Tag = Span & { name: string; nameEnd: number; classSpans: Span[]; attributes: Attribute[] }
function span(node: t.Node): Span | undefined {
  return node.start == null || node.end == null ? undefined : { start: node.start, end: node.end }
}

/** JSX opening tags with exact source spans and attributes in source order. */
export function jsxTags(text: string): Tag[] {
  const root = source(text)
  if (!root) return []
  return walk(root).flatMap((tag): Tag[] => {
    if (tag.type !== "JSXOpeningElement") return []
    const tagSpan = span(tag),
      tagName = span(tag.name)
    if (!tagSpan || !tagName) return []
    const attributes = tag.attributes.flatMap((attribute): Attribute[] => {
      const at = span(attribute)
      if (!at) return []
      if (attribute.type === "JSXSpreadAttribute") return [at]
      const name = text.slice(attribute.name.start ?? 0, attribute.name.end ?? 0)
      const raw = attribute.value
      const expression = raw?.type === "JSXExpressionContainer" ? raw.expression : raw
      let value: NonNullable<Attribute["value"]> = { kind: "code" }
      if (!raw) value = { kind: "literal", value: true }
      else if (expression?.type === "StringLiteral" || expression?.type === "BooleanLiteral")
        value = { kind: "literal", value: expression.value }
      else if (expression?.type === "Identifier" && expression.name === name)
        value = { kind: "forward" }
      return [{ ...at, name, value }]
    })
    const classSpans = tag.attributes.flatMap((attribute) => {
      if (
        attribute.type !== "JSXAttribute" ||
        nameOf(attribute.name) !== "className" ||
        !attribute.value
      )
        return []
      return walk(attribute.value).flatMap((item) => {
        if (item.type === "StringLiteral") return span(item) ?? []
        if (item.type !== "TemplateLiteral") return []
        return item.quasis.flatMap((quasi, index) => {
          const at = span(quasi)
          if (!at) return []
          const raw = text.slice(at.start, at.end)
          const start = index > 0 ? (raw.search(/\s/) < 0 ? raw.length : raw.search(/\s/)) : 0
          const end = index < item.expressions.length ? raw.search(/\S*$/) : raw.length
          return start < end ? [{ start: at.start + start, end: at.start + end }] : []
        })
      })
    })
    return [
      {
        ...tagSpan,
        name: text.slice(tagName.start, tagName.end),
        nameEnd: tagName.end,
        classSpans,
        attributes,
      },
    ]
  })
}

/** Counts JSX uses of a component and its local import aliases. */
export function componentUseCount(text: string, component: string, definedHere: boolean): number {
  const root = source(text)
  if (!root) return 0
  const names = new Set(definedHere ? [component] : [])
  for (const statement of root.program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
    for (const item of statement.specifiers) {
      if (
        item.type === "ImportSpecifier" &&
        item.importKind !== "type" &&
        nameOf(item.imported) === component
      )
        names.add(item.local.name)
      if (item.type === "ImportDefaultSpecifier" && item.local.name === component)
        names.add(item.local.name)
    }
  }
  return walk(root).filter(
    (item) => item.type === "JSXOpeningElement" && names.has(nameOf(item.name) ?? ""),
  ).length
}
