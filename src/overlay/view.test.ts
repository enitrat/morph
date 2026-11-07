import { describe, expect, it } from "vitest"

import { sideFor } from "./view"

describe("where the panel docks", () => {
  it("takes the side with more free room beside the picks", () => {
    expect(sideFor([{ left: 300, right: 900 }], 1440)).toBe("right")
    expect(sideFor([{ left: 700, right: 1300 }], 1440)).toBe("left")
  })

  it("docks along the bottom when the picks leave no room on either side", () => {
    expect(sideFor([{ left: 100, right: 1340 }], 1440)).toBe("bottom")
  })

  it("docks right when nothing is picked", () => {
    expect(sideFor([], 1440)).toBe("right")
  })
})
