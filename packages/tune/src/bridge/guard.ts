const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])
const DEFAULT_ORIGINS = ["http://localhost:3000", "https://localhost:3000"]

export type Guarded = { answer: Response } | { cors: Readonly<Record<string, string>> }

const forbidden = (issue: string, headers?: HeadersInit) =>
  Response.json({ error: { kind: "bad-request", issues: [issue] } }, { status: 403, headers })

function hostnameOf(host: string | null): string | undefined {
  if (!host) return undefined
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

function allowedOrigins(request: Request): string[] {
  const listed = process.env.TUNE_ORIGINS?.split(",").map((origin) => origin.trim())
  const own = `${new URL(request.url).protocol}//${request.headers.get("host")}`
  return [...(listed ?? DEFAULT_ORIGINS), own]
}

function corsFor(origin: string | null): Record<string, string> {
  if (origin === null) return {}
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-tune",
    "access-control-max-age": "600",
    vary: "origin",
  }
}

/**
 * Admits a request to a tune route, or answers it. Outside development it answers 404 before
 * anything is read. It serves only a localhost `Host`, only allowlisted origins (`TUNE_ORIGINS`,
 * else the app's dev origins, plus the route's own), and a POST only with `x-tune: 1`, which
 * forces a CORS preflight; it answers the preflight itself. An admitted request gets the CORS
 * headers its response carries.
 */
export function guard(request: Request): Guarded {
  if (process.env.NODE_ENV !== "development") {
    return { answer: new Response(null, { status: 404 }) }
  }
  const hostname = hostnameOf(request.headers.get("host"))
  if (!hostname || !LOCAL_HOSTS.has(hostname))
    return { answer: forbidden("host must be localhost") }
  const origin = request.headers.get("origin")
  if (origin !== null && !allowedOrigins(request).includes(origin)) {
    return { answer: forbidden(`origin ${origin} is not allowed`) }
  }
  const cors = corsFor(origin)
  if (request.method === "OPTIONS")
    return { answer: new Response(null, { status: 204, headers: cors }) }
  if (request.method === "POST" && request.headers.get("x-tune") !== "1") {
    return { answer: forbidden("x-tune: 1 header missing", cors) }
  }
  return { cors }
}
