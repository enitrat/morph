/** Alt+Shift+R toggles pointing. */
export const isPointShortcut = (event: Pick<KeyboardEvent, "altKey" | "shiftKey" | "code">) =>
  event.altKey && event.shiftKey && event.code === "KeyR"

/** Whether a key is going into a field, so Morph's single-letter keys leave it alone. */
export const isTyping = (event: KeyboardEvent) =>
  event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        (node.isContentEditable || node.tagName === "INPUT" || node.tagName === "TEXTAREA"),
    )
