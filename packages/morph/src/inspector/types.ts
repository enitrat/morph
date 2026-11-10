import { type TokenName } from "../core/design-system"

export type ReadState =
  | "rest"
  | "hover"
  | "focus-visible"
  | "active"
  | "disabled"
  | "checked"
  | "open"

/** One ds token the element reads, checked against its computed style. */
export interface Read {
  property: string
  token: TokenName
  state: ReadState
  via: "rule" | "inline" | "inherited"
}
