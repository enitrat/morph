import { expect, it } from "vitest"

import { matchOf, type Step } from "./scale"

const space: Step[] = [4, 8, 12, 16, 20, 24, 32, 48, 64, 80].map((px) => ({
  name: `space-${px / 4}`,
  px,
}))

it("names a token only for a value on it", () => {
  expect(matchOf(16, space)).toEqual({ kind: "token", name: "space-4" })
  expect(matchOf(73, space)).toEqual({ kind: "off", near: "space-20" })
})

it("lets a distance land within a subpixel of a token", () => {
  expect(matchOf(15.4, space, 1)).toEqual({ kind: "token", name: "space-4" })
  expect(matchOf(15, space, 1).kind).toBe("off")
  expect(matchOf(73, space, 1).kind).toBe("off")
})
