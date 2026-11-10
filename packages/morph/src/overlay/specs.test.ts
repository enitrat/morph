import { expect, it } from "vitest"

import { type Scales } from "./scale"
import { deltaOf, type Spec } from "./specs"

const scales: Scales = {
  space: [
    { name: "space-4", px: 16 },
    { name: "space-6", px: 24 },
  ],
  radius: [{ name: "radius-lg", px: 10 }],
  colors: new Map([["rgb(24, 24, 27)", "foreground"]]),
}

const spec = (change: Partial<Spec> = {}): Spec => ({
  width: 300,
  height: 120,
  display: "flex",
  padding: [16, 16, 16, 16],
  margin: [0, 0, 0, 0],
  border: [0, 0, 0, 0],
  gap: 16,
  radius: 10,
  font: { size: 14, lineHeight: "20px", weight: "400", family: "Inter", letterSpacing: "normal" },
  text: null,
  fill: null,
  stroke: null,
  ...change,
})

it("lists nothing when the variant changed nothing measurable", () => {
  expect(deltaOf(spec(), spec(), scales)).toEqual([])
})

it("lists what changed, with the token each new length lands on or the nearest off it", () => {
  const changes = deltaOf(
    spec(),
    spec({ padding: [24, 18, 24, 18], gap: 24, radius: 12, height: 140, fill: "rgb(24, 24, 27)" }),
    scales,
  )
  expect(changes).toEqual([
    {
      kind: "length",
      label: "padding y",
      was: 16,
      now: 24,
      match: { kind: "token", name: "space-6" },
    },
    {
      kind: "length",
      label: "padding x",
      was: 16,
      now: 18,
      match: { kind: "off", near: "space-4" },
    },
    { kind: "length", label: "gap", was: 16, now: 24, match: { kind: "token", name: "space-6" } },
    {
      kind: "length",
      label: "radius",
      was: 10,
      now: 12,
      match: { kind: "off", near: "radius-lg" },
    },
    { kind: "length", label: "height", was: 120, now: 140, match: { kind: "none" } },
    { kind: "color", label: "fill", was: null, now: "rgb(24, 24, 27)", role: "foreground" },
  ])
})

it("splits a padding whose sides no longer match", () => {
  const labels = deltaOf(spec(), spec({ padding: [24, 16, 16, 16] }), scales).map(
    (change) => change.label,
  )
  expect(labels).toEqual(["padding top"])
})
