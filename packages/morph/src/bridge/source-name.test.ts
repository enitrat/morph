import { expect, it } from "vitest"

import { sourceFileOf } from "./source-name"

it.each([
  ["file:///repo/app/page.tsx", { from: "absolute", path: "/repo/app/page.tsx" }],
  ["file:///repo/my%20app/page.tsx", { from: "absolute", path: "/repo/my app/page.tsx" }],
  [
    "turbopack:///[project]/apps/site/app/page.tsx [app-rsc] (ecmascript)",
    { from: "project", path: "apps/site/app/page.tsx" },
  ],
  ["webpack://_N_E/./app/page.tsx?3a1f", { from: "context", path: "app/page.tsx" }],
  [
    "webpack-internal:///(app-pages-browser)/./components/card.tsx",
    { from: "context", path: "components/card.tsx" },
  ],
  ["/@fs/repo/packages/ui/button.tsx", { from: "absolute", path: "/repo/packages/ui/button.tsx" }],
  ["button.tsx", { from: "module", path: "button.tsx" }],
  ["../ui/button.tsx?v=12", { from: "module", path: "../ui/button.tsx" }],
  [
    "about://React/Server/file:///repo/app/page.tsx",
    { from: "absolute", path: "/repo/app/page.tsx" },
  ],
])("reads %s", (name, file) => {
  expect(sourceFileOf(name)).toEqual(file)
})

it.each(["", "<anonymous>", "\0virtual:morph", "/@id/__x00__virtual:morph"])(
  "names no file for %j",
  (name) => {
    expect(sourceFileOf(name)).toBeNull()
  },
)
