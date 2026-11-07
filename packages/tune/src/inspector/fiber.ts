/** The slice of a React fiber the inspector reads. Undocumented; dev React keeps names. */
export interface Fiber {
  type: unknown
  return: Fiber | null
  child: Fiber | null
  memoizedProps: Record<string, unknown> | null
  stateNode: unknown
  /** Dev only: the component whose render created this fiber's element. */
  _debugOwner?: Fiber | null
  /** Dev only: the stack where this fiber's element was created, its JSX call site first. */
  _debugStack?: Error | null
}

export function fiberOf(element: Element): Fiber | undefined {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"))
  return key ? (element as unknown as Record<string, Fiber>)[key] : undefined
}

export function nameOf(type: unknown): string | undefined {
  if (typeof type === "function") {
    const named = type as { displayName?: string; name?: string }
    return named.displayName ?? named.name
  }
  if (typeof type === "object" && type !== null) {
    const wrapped = type as { displayName?: string; type?: unknown; render?: unknown }
    return wrapped.displayName ?? nameOf(wrapped.type) ?? nameOf(wrapped.render)
  }
  return undefined
}

export const isComponentName = (name: string | undefined): name is string =>
  name !== undefined &&
  /^[A-Z]/.test(name) &&
  !name.endsWith("Provider") &&
  !name.endsWith("Context")
