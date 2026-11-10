// Drives the overlay through its main states on the Next example's /tour page and saves numbered
// screenshots. Needs `pnpm dev` on :3000 and a fresh `pnpm --filter @enitrat/morph build`.
//   node packages/morph/scripts/tour.mjs [out-dir]
// PLAYWRIGHT_CORE points at a playwright-core install; Morph itself does not depend on it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core")

const ROOT = resolve(import.meta.dirname, "../../..")
const OUT = resolve(process.argv[2] ?? join(ROOT, ".tour"))
const URL = process.env.TOUR_URL ?? "http://localhost:3000/tour"
// A dial release writes to the example's code; the tour puts it back.
const WRITTEN = [
  "examples/shared/tour.tsx",
  "examples/shared/ui/card.tsx",
  "examples/shared/ui/button.tsx",
  "examples/shared/ui/badge.tsx",
  "examples/shared/styles.css",
]
const saved = new Map(WRITTEN.map((file) => [file, readFileSync(join(ROOT, file), "utf8")]))

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("console", (message) => message.type() === "error" && errors.push(message.text()))

let n = 0
const shot = async (name) => {
  await page.waitForTimeout(450)
  const file = join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`)
  await page.screenshot({ path: file })
  console.log(file)
}
const center = async (locator) => {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`not visible: ${locator}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}
const hover = async (locator, dx = 0, dy = 0) => {
  const { x, y } = await center(locator)
  await page.mouse.move(x + dx, y + dy, { steps: 4 })
}
const click = async (locator, dx = 0, dy = 0) => {
  await hover(locator, dx, dy)
  await page.mouse.down()
  await page.mouse.up()
}
/** A point just inside the top edge, on the element's own padding rather than a child. */
const top = async (locator) => {
  const { box } = await center(locator)
  return { dx: 0, dy: -box.height / 2 + 8 }
}
const inMorph = (selector, options) => page.locator("morph-root").locator(selector, options)
const scrollTo = (locator) =>
  locator.evaluate((element) => element.scrollIntoView({ block: "center" }))

try {
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForSelector("morph-root", { state: "attached" })
  await page.waitForTimeout(500)
  await page.keyboard.press("Alt+Shift+R")

  const triggers = page.locator("[data-slot=card]", { hasText: "Triggers" })
  const insights = page.locator("[data-slot=card]", { hasText: "Insights" })
  await scrollTo(triggers)
  const edge = await top(triggers)
  await hover(triggers, edge.dx, edge.dy)
  await shot("hover")

  await click(triggers, edge.dx, edge.dy)
  await shot("selected-action-bar")

  await page.keyboard.down("Alt")
  await hover(triggers.locator("[data-slot=card-title]"))
  await shot("lens-held")
  await page.keyboard.up("Alt")

  await page.keyboard.press("Escape")
  await page.keyboard.press("i")
  const shotBox = page.locator("section div.bg-secondary").first()
  await scrollTo(shotBox)
  await hover(shotBox.locator("div").first(), 0, 40)
  await shot("lens-latched")
  await page.keyboard.press("i")

  const pricing = page.locator("section", { hasText: "Simple pricing" }).locator(".grid")
  await scrollTo(pricing)
  const { box } = await center(pricing)
  await page.mouse.move(box.x - 12, box.y - 12)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height + 12, { steps: 12 })
  await shot("frame-dragging")
  await page.mouse.up()
  await shot("frame-sheet")
  await inMorph("text=raw colour").first().hover()
  await shot("frame-finding-hover")

  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await scrollTo(triggers)
  await click(triggers, edge.dx, edge.dy)
  await page.keyboard.press("s")
  await shot("sidebar-specs")
  await hover(insights.locator("[data-slot=card-title]"))
  await shot("specs-hover-preview")

  await page.keyboard.press("t")
  await page.waitForTimeout(800)
  const line = inMorph(".dial-line").first()
  await line.waitFor()
  await line.click()
  const slider = inMorph("[role=slider]").first()
  await slider.focus()
  await page.keyboard.down("ArrowRight")
  await shot("morph-step-preview")
  await page.keyboard.up("ArrowRight")
  const write = inMorph("button", { hasText: "Write it" })
  if (await write.isVisible()) await write.click()
  await page.waitForTimeout(1500)
  await shot("morph-written")

  await page.keyboard.press("l")
  await inMorph("[role=treeitem]", { hasText: "PricingCard" }).first().hover()
  await shot("layers-hover")
  await inMorph("[role=treeitem]").filter({ hasText: "FeatureCard" }).nth(2).click()
  await page.mouse.move(700, 880)
  await shot("side-switch")

  await page.keyboard.press("s")
  const hero = page.locator("section", { hasText: "Ship the work" })
  await scrollTo(hero)
  await click(hero.locator("p"))
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.press("Shift+Enter")
  await page.mouse.move(720, 890)
  await shot("full-width-narrow")

  await scrollTo(triggers)
  await click(triggers, edge.dx, edge.dy)
  await page.keyboard.press("\\")
  await page.keyboard.press("a")
  await inMorph("textarea").waitFor()
  await page.waitForTimeout(200)
  await page.keyboard.type("More air between the icon and the title")
  await inMorph("[role=radio]", { hasText: "Box" }).click()
  const icon = triggers.locator("span").first()
  const { box: at } = await center(icon)
  await page.mouse.move(at.x - 6, at.y - 6)
  await page.mouse.down()
  await page.mouse.move(at.x + 220, at.y + at.height + 50, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.type("tighter")
  await page.keyboard.press("Enter")
  // Generate would start real agent runs; scripts/session-tour.mjs covers sessions.
  await shot("composer")
} finally {
  await browser.close()
  for (const [file, text] of saved)
    if (readFileSync(join(ROOT, file), "utf8") !== text) writeFileSync(join(ROOT, file), text)
}

if (errors.length > 0) {
  console.error(`page errors:\n${errors.join("\n")}`)
  process.exitCode = 1
}
