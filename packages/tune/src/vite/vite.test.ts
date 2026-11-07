import { createServer } from "node:http"
import { type AddressInfo } from "node:net"

import { expect, it } from "vitest"

import config from "../bridge/fixtures/acme/tune.config"
import { tune } from "./index.js"
import { nodeHandler } from "./node"

it("serves the dev server only, and adds the widget to a single-page app", () => {
  const plugin = tune(config, { base: "/__tune" })
  expect(plugin.apply).toBe("serve")
  const html = plugin.transformIndexHtml as () => unknown
  expect(html()).toEqual([
    expect.objectContaining({ attrs: { type: "module", src: "/@id/virtual:tune" } }),
  ])
  expect((tune(config, { inject: false }).transformIndexHtml as () => unknown)()).toEqual([])
})

it("hands the handler a Request whose op is the path below the base, body unread", async () => {
  const server = createServer((req, res) => {
    Object.assign(req, { originalUrl: req.url, url: req.url?.replace(/^\/__tune/, "") })
    void nodeHandler(async (request, op) =>
      Response.json(
        { op, method: request.method, url: request.url, body: await request.text() },
        { status: 201, headers: { "x-seen": request.headers.get("x-tune") ?? "" } },
      ),
    )(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  const response = await fetch(`http://127.0.0.1:${port}/__tune/ask?x=1`, {
    method: "POST",
    headers: { "x-tune": "1" },
    body: "{}",
  })
  server.close()

  expect(response.status).toBe(201)
  expect(response.headers.get("x-seen")).toBe("1")
  expect(await response.json()).toEqual({
    op: "ask",
    method: "POST",
    url: `http://127.0.0.1:${port}/__tune/ask?x=1`,
    body: "{}",
  })
})
