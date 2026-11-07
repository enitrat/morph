// oxlint-disable-next-line import/no-nodejs-modules -- the adapter bridges Node's server to fetch.
import { type IncomingMessage, type ServerResponse } from "node:http"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { Readable } from "node:stream"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { type TLSSocket } from "node:tls"

import { type Handler } from "../bridge/handler"

/**
 * Serves `handle` as Connect middleware mounted at the bridge's base, which Connect strips from
 * `req.url`, so the first path segment left is the op. The body streams into the `Request`, so the
 * guard answers before anything is read.
 */
export function nodeHandler(handle: Handler) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://base")
    const scheme = (req.socket as TLSSocket).encrypted ? "https" : "http"
    const aborted = new AbortController()
    res.on("close", () => {
      if (!res.writableFinished) aborted.abort()
    })
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers))
      for (const one of [value ?? []].flat()) headers.append(name, one)
    const method = req.method ?? "GET"
    const path = (req as { originalUrl?: string }).originalUrl ?? req.url ?? "/"
    const request = new Request(`${scheme}://${req.headers.host}${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? null : (Readable.toWeb(req) as ReadableStream),
      signal: aborted.signal,
      duplex: "half",
    } as RequestInit)
    const response = await handle(request, url.pathname.slice(1))
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}
