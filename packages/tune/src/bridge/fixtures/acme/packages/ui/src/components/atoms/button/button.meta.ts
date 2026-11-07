import { type ControlMeta } from "../../../meta"

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
    press: { kind: "enum", options: ["scale", "morph"], default: "scale" },
    leadingIcon: { kind: "boolean", label: "Leading icon", default: false, target: "none" },
    children: { kind: "text", label: "Label", default: "Save", target: "none" },
    loading: { kind: "boolean", default: false },
    disabled: { kind: "boolean", default: false },
  },
} as const satisfies ControlMeta
