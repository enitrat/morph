import { z } from "zod"

import { ThemeName } from "../core/config"
import { SourceLoc } from "../variant/model"

const ClassName = z.string().regex(/^[a-z][\w.-]*$/, "not a plain utility class")

/** One dial released: a token's new value, or one class swapped in a JSX opening tag. */
export const DialWrite = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("token"),
    token: z.string().regex(/^--[\w-]+$/) as z.ZodType<`--${string}`>,
    scope: z.union([z.literal("all"), ThemeName]),
    to: z.string().min(1).max(200),
  }),
  z.object({ kind: z.literal("utility"), site: SourceLoc, from: ClassName, to: ClassName }),
])
export type DialWrite = z.infer<typeof DialWrite>

/** `changed: false` when the code already held the value. */
export const Dialed = z.object({
  changed: z.boolean(),
  file: z.string(),
  warning: z.string().optional(),
})
export type Dialed = z.infer<typeof Dialed>
