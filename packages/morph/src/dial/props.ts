import { z } from "zod"

import { SourceLoc } from "../variant/model"
import { type Attribute } from "./jsx"

const PropName = z.string().regex(/^[a-z]\w*$/, "not a prop name")
export const ComponentName = z.string().regex(/^[A-Z][\w.$]*$/, "not a component name")
export const PropValue = z.union([z.string().regex(/^[\w -]*$/), z.boolean()])
export type PropValue = z.infer<typeof PropValue>

/** A prop a designer can set from the panel: one of its options, or on and off. */
export const PropControl = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("enum"),
    name: PropName,
    options: z.array(z.string().regex(/^[\w -]*$/)).min(1),
    default: z.string(),
  }),
  z.object({ kind: z.literal("boolean"), name: PropName, default: z.boolean() }),
])
export type PropControl = z.infer<typeof PropControl>

/** A lab Playground control as its `meta.controls` writes it; only the fields Props reads. */
const MetaControl = z.looseObject({
  kind: z.string(),
  target: z.enum(["prop", "children", "none"]).optional(),
})

const Meta = z.object({ component: z.string(), controls: z.record(z.string(), MetaControl) })

/**
 * The enum and boolean props `component` takes from its meta's Playground controls; none when the
 * meta describes another component of its folder.
 */
export function controlsOf(raw: unknown, component: string): PropControl[] {
  const meta = Meta.parse(raw)
  if (meta.component !== component) return []
  return Object.entries(meta.controls).flatMap(([name, control]) => {
    if ((control.target ?? "prop") !== "prop") return []
    if (control.kind !== "enum" && control.kind !== "boolean") return []
    return [PropControl.parse({ ...control, name })]
  })
}

/** The value a write puts in the code: `null` drops the attribute, since the default needs none. */
export const writeOf = (control: PropControl, value: PropValue): PropValue | null =>
  value === control.default ? null : value

/** What one call site says about a prop. */
export type Resolved =
  /** The site writes it as a literal, or leaves it out: the panel writes it there. */
  | { kind: "edit"; written: PropValue | null }
  /** The site passes the enclosing component's own prop on: the next call site up decides. */
  | { kind: "climb" }
  /** Code computes it: the panel shows it and leaves it to the code. */
  | { kind: "code" }

/** How the attributes of one call site settle prop `name`, as `setAttribute` would write them. */
export function resolveAt(attributes: readonly Attribute[], name: string): Resolved {
  const index = attributes.findLastIndex(
    (attribute) => attribute.kind === "attribute" && attribute.name === name,
  )
  const spreadAfter = attributes.some((attribute, at) => attribute.kind === "spread" && at > index)
  const present = attributes[index]
  if (present?.kind !== "attribute")
    return spreadAfter ? { kind: "climb" } : { kind: "edit", written: null }
  const twice = attributes.some(
    (attribute, at) => at !== index && attribute.kind === "attribute" && attribute.name === name,
  )
  if (twice || present.value.kind === "code") return { kind: "code" }
  // A forwarded prop and a spread after it both come from the enclosing component.
  if (present.value.kind === "forward") return { kind: "climb" }
  return spreadAfter ? { kind: "code" } : { kind: "edit", written: present.value.value }
}

/** One prop set at one call site: `to: null` removes the attribute. */
export const PropWrite = z.object({
  site: SourceLoc,
  /** The tag written at the site, which may be a component wrapping `component`. */
  tag: ComponentName,
  /** The catalog component whose controls allow the value. */
  component: ComponentName,
  name: PropName,
  to: PropValue.nullable(),
})
export type PropWrite = z.infer<typeof PropWrite>

/** The call site after the write, which formatting may have moved. */
export const PropWritten = z.object({
  changed: z.boolean(),
  site: SourceLoc,
  warning: z.string().optional(),
})
export type PropWritten = z.infer<typeof PropWritten>

/** How often a component is rendered as JSX across apps and packages, lab examples apart. */
export interface ComponentUses {
  uses: number
  examples: number
}
