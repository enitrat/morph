/** The slice of a React fiber the inspector reads. Undocumented; dev React keeps names. */
export interface Fiber {
  type: unknown
  return: Fiber | null
  child: Fiber | null
  memoizedProps: Record<string, unknown> | null
  stateNode: unknown
  /** Dev only: the component whose render created this fiber's element. */
  _debugOwner?: Instance | null
  /** Dev only: the stack where this fiber's element was created, its JSX call site first. */
  _debugStack?: Error | null
  /** Dev only: what the server sent along with this fiber's element, Server Components among it. */
  _debugInfo?: readonly unknown[] | null
}

/**
 * Dev only: a Server Component as the browser sees it, in the `_debugInfo` of the fiber it
 * rendered and as the owner of the elements it created.
 */
export interface ServerComponent {
  name: string
  /** The environment that rendered it, such as `Server`. */
  env: string
  props?: Record<string, unknown> | null
  owner?: Instance | null
  debugStack?: Error | null
}

/** A rendered component: a client component's fiber, or a Server Component's debug record. */
export type Instance = Fiber | ServerComponent

const isFiber = (instance: Instance): instance is Fiber => "memoizedProps" in instance

const isServerComponent = (info: unknown): info is ServerComponent =>
  typeof info === "object" &&
  info !== null &&
  typeof (info as { name?: unknown }).name === "string" &&
  typeof (info as { env?: unknown }).env === "string"

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

/* oxlint-disable no-underscore-dangle -- React's dev-only fields, read as React names them. */
export const instanceName = (instance: Instance) =>
  isFiber(instance) ? nameOf(instance.type) : instance.name

export const ownerOf = (instance: Instance): Instance | null =>
  (isFiber(instance) ? instance._debugOwner : instance.owner) ?? null

/** Where the instance's element was created, its JSX call site first. */
export const stackOf = (instance: Instance): Error | null =>
  (isFiber(instance) ? instance._debugStack : instance.debugStack) ?? null

export const propsOf = (instance: Instance): Record<string, unknown> =>
  (isFiber(instance) ? instance.memoizedProps : instance.props) ?? {}

/** The Server Components whose output this fiber is, outermost first. */
export const serverComponentsOf = (fiber: Fiber): ServerComponent[] =>
  (fiber._debugInfo ?? []).filter(isServerComponent)
/* oxlint-enable no-underscore-dangle */

/**
 * The components an element is the root of, innermost first: client component fibers between it
 * and the host element above, and the Server Components that rendered any of them.
 */
export function rootedAt(element: Element): Instance[] {
  const found: Instance[] = []
  for (let fiber = fiberOf(element) ?? null; fiber; fiber = fiber.return) {
    if (fiber.stateNode instanceof Element && fiber.stateNode !== element) break
    if (fiber.stateNode !== element) found.push(fiber)
    found.push(...serverComponentsOf(fiber).reverse())
  }
  return found
}

export const isComponentName = (name: string | undefined): name is string =>
  name !== undefined &&
  /^[A-Z]/.test(name) &&
  !name.endsWith("Provider") &&
  !name.endsWith("Context")
