import { describe, expect, it } from "vitest"

import { TuneConfig } from "../core/config"
import { configAt } from "./git"
import { CONFIG } from "./test-fixtures"

const repo = { root: "/repo", dir: "/repo/.git" }
const app = "/repo/apps/site"

describe("app configuration context", () => {
  it("normalizes app paths once and preserves them through serialization", () => {
    const config = configAt(repo, app, {
      ...CONFIG,
      pathBase: "app",
      tokens: { ...CONFIG.tokens, files: ["src/theme.css", "../../shared/theme.css"] },
      plumbing: [{ prefix: "src/generated", except: [] }],
    })
    expect(config.appRoot).toBe("apps/site")
    expect(config.tokens.files).toEqual(["apps/site/src/theme.css", "shared/theme.css"])
    expect(config.plumbing[0]?.prefix).toBe("apps/site/src/generated")
    expect(TuneConfig.parse(JSON.parse(JSON.stringify(config)))).toEqual(config)
  })

  it("supports explicit repo-relative inputs and rejects paths outside the checkout", () => {
    const config = configAt(repo, app, {
      ...CONFIG,
      pathBase: "repo",
      tokens: { ...CONFIG.tokens, files: ["shared/theme.css"] },
    })
    expect(config.tokens.files).toEqual(["shared/theme.css"])
    expect(() =>
      configAt(repo, app, {
        ...CONFIG,
        pathBase: "app",
        tokens: { ...CONFIG.tokens, files: ["../../../outside.css"] },
      }),
    ).toThrow(/inside the Git checkout/)
    expect(() => configAt(repo, "/outside", CONFIG)).toThrow(/inside the Git checkout/)
  })
})
