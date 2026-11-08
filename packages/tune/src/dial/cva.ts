import { cvaVariants } from "../syntax/source"
import { PropControl } from "./props"

/** Controls described by a component's CVA variants and explicit defaults. */
export function cvaControls(text: string, component: string): PropControl[] {
  return cvaVariants(text, component).map(({ name, options, fallback }) => {
    const boolean = options.length === 2 && options.includes("true") && options.includes("false")
    return PropControl.parse(
      boolean
        ? { kind: "boolean", name, default: fallback === "true" }
        : { kind: "enum", name, options, default: fallback },
    )
  })
}
