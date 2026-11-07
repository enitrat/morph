/**
 * Keeps one fixed box per element over it, following layout and scroll every frame without a
 * React render per frame; `each` runs on every box each frame. An element with no box (hidden at
 * this viewport) hides its box.
 */
export function followBoxes(
  layer: HTMLElement,
  elements: readonly Element[],
  className: string,
  decorate?: (box: HTMLElement) => void,
  each?: (box: HTMLElement, rect: DOMRect) => void,
): () => void {
  const boxes = elements.map(() => {
    const box = document.createElement("div")
    box.className = className
    decorate?.(box)
    layer.append(box)
    return box
  })
  let frame = 0
  const tick = () => {
    for (const [index, element] of elements.entries()) {
      const box = boxes[index]
      if (!box) continue
      const rect = element.getBoundingClientRect()
      box.style.transform = `translate(${rect.left}px, ${rect.top}px)`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
      box.hidden = rect.width === 0 && rect.height === 0
      each?.(box, rect)
    }
    frame = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(frame)
    for (const box of boxes) box.remove()
  }
}
