import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { guard } from "./guard"

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development")
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const CATALOG = "http://localhost:6006"

function call(init: { method?: string; headers?: Record<string, string> } = {}) {
  return guard(
    new Request(`${CATALOG}/api/morph/op`, {
      method: init.method ?? "POST",
      headers: {
        host: "localhost:6006",
        origin: "http://localhost:3000",
        "x-morph": "1",
        ...init.headers,
      },
    }),
  )
}

const status = (guarded: ReturnType<typeof guard>) =>
  "answer" in guarded ? guarded.answer.status : "admitted"

describe("guard", () => {
  it("refuses a Host other than localhost", () => {
    expect(status(call({ headers: { host: "evil.example:6006" } }))).toBe(403)
    expect(status(call({ headers: { host: "127.0.0.1:6006" } }))).toBe("admitted")
  })

  it("refuses an origin off the allowlist and echoes an allowed one", () => {
    expect(status(call({ headers: { origin: "https://evil.example" } }))).toBe(403)
    const allowed = call({ headers: { origin: "https://localhost:3000" } })
    expect("cors" in allowed && allowed.cors["access-control-allow-origin"]).toBe(
      "https://localhost:3000",
    )
    expect(status(call({ headers: { origin: CATALOG } }))).toBe("admitted")
  })

  it("reads the allowlist from MORPH_ORIGINS", () => {
    vi.stubEnv("MORPH_ORIGINS", "http://localhost:4000")
    expect(status(call({ headers: { origin: "http://localhost:3000" } }))).toBe(403)
    expect(status(call({ headers: { origin: "http://localhost:4000" } }))).toBe("admitted")
  })

  it("answers a preflight with the allowed headers", () => {
    const guarded = call({ method: "OPTIONS", headers: { "x-morph": "" } })
    expect(status(guarded)).toBe(204)
    expect(
      "answer" in guarded && guarded.answer.headers.get("access-control-allow-headers"),
    ).toContain("x-morph")
  })
})
