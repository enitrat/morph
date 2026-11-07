import { type ControlMeta } from "../../meta"

export const meta = {
  title: "Button",
  component: "Button",
  description: "A button that triggers an action.",
  controls: {
    variant: {
      kind: "enum",
      options: ["primary", "secondary", "outline", "ghost", "destructive"],
      default: "primary",
    },
    size: { kind: "enum", options: ["sm", "md", "lg"], default: "md" },
    children: { kind: "text", label: "Label", default: "Save", target: "none" },
    disabled: { kind: "boolean", default: false },
  },
} as const satisfies ControlMeta
