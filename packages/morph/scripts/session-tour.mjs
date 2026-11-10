// Runs real variant sessions on the Next example's /tour page with the `claude` CLI and saves
// numbered screenshots: two asks in parallel on different files, flips, a keep, two sessions on
// one file waiting on each other, then discards. Needs `pnpm dev` on :3000, a fresh
// `pnpm --filter @enitrat/morph build`, and a clean examples/ tree; it costs real agent runs.
//   node packages/morph/scripts/session-tour.mjs [out-dir]
// PLAYWRIGHT_CORE points at a playwright-core install; Morph itself does not depend on it.
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core")

const ROOT = resolve(import.meta.dirname, "../../..")
const OUT = resolve(process.argv[2] ?? join(ROOT, ".tour/sessions"))
const ORIGIN = process.env.TOUR_ORIGIN ?? "http://localhost:3000"
const BRIDGE = `${ORIGIN}/api/morph`
const GENERATE_MS = 15 * 60_000

mkdirSync(OUT, { recursive: true })
const started = Date.now()
const clock = () => `${((Date.now() - started) / 1000).toFixed(1)}s`
const log = (...parts) => console.log(`[${clock()}]`, ...parts)

async function bridge(op, body) {
  const response = await fetch(`${BRIDGE}/${op}`, {
    method: body ? "POST" : "GET",
    headers: { "x-morph": "1", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`${op}: ${JSON.stringify(json)}`)
  return json
}

/** Polls the page view until `test` holds, logging each variant's phase as it changes. */
async function until(what, test, timeout = GENERATE_MS) {
  const end = Date.now() + timeout
  let last = ""
  for (;;) {
    const view = await bridge("page")
    const now = view.sessions
      .map(
        (s) =>
          `${s.id.slice(0, 4)}:${s.place.kind}[${s.variants.map((v) => (v.state === "pending" ? v.phase : v.state)).join(",")}]`,
      )
      .join(" ")
    if (now !== last) log(what, "·", now || "no sessions")
    last = now
    if (test(view)) return view
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((done) => setTimeout(done, 1500))
  }
}

const settled = (session) => session.variants.every((v) => v.state !== "pending")

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("console", (message) => message.type() === "error" && errors.push(message.text()))

let n = 0
const shot = async (name) => {
  await page.waitForTimeout(600)
  const file = join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`)
  await page.screenshot({ path: file })
  log(file)
}
const inMorph = (selector, options) => page.locator("morph-root").locator(selector, options)
const scrollTo = (locator) =>
  locator.evaluate((element) => element.scrollIntoView({ block: "center" }))
async function clickAt(locator, dy = 0) {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`not visible: ${locator}`)
  await page.mouse.move(box.x + box.width / 2, box.y + (dy < 0 ? 8 : box.height / 2), { steps: 4 })
  await page.mouse.down()
  await page.mouse.up()
}
const pin = (number) => inMorph(`button[aria-label^="Pin ${number},"]`)
const chip = (name) => inMorph("[role=toolbar] button[aria-pressed]", { hasText: name })
const card = () => inMorph("[role=dialog][aria-label^=Pin]")
const row = (letter) =>
  card()
    .locator("button[aria-pressed]")
    .filter({ hasText: new RegExp(`^${letter}`) })

async function askAbout(locator, words, dy = 0) {
  await scrollTo(locator)
  await clickAt(locator, dy)
  await page.keyboard.press("a")
  await inMorph("textarea").waitFor()
  await page.keyboard.type(words)
  await page.keyboard.press("Enter")
  await inMorph("textarea").waitFor({ state: "detached" })
  await page.waitForTimeout(1500)
  const notice = await inMorph("[role=status]").allTextContents()
  if (notice.some((text) => text.startsWith("Could not")))
    throw new Error(`the ask was dropped: ${notice.join(" ")}`)
}

const sessionIds = []
try {
  // The first load after a package build makes the dev server recompile and reload the page.
  await page.goto(`${ORIGIN}/tour`, { waitUntil: "networkidle" })
  await page.waitForTimeout(3000)
  await page.goto(`${ORIGIN}/tour`, { waitUntil: "networkidle" })
  await page.waitForSelector("morph-root", { state: "attached" })
  await page.waitForTimeout(500)
  await page.keyboard.press("Alt+Shift+R")

  const triggers = page.locator("[data-slot=card]", { hasText: "Triggers" })
  const teamButton = page.locator("button", { hasText: "Choose Team" })

  await scrollTo(triggers)
  await clickAt(triggers, -1)
  await page.keyboard.press("a")
  await inMorph("textarea").waitFor()
  await page.keyboard.type("More presence: a larger icon tile and a stronger title")
  await shot("ask-feature-card")
  await page.keyboard.press("Enter")
  const askedFeature = Date.now()
  await askAbout(
    teamButton,
    "Restyle the Button component itself in ui/button.tsx: a softer radius and a subtle lift on hover",
  )
  const askedButton = Date.now()
  await pin(2).waitFor()
  log("asked both", `${(askedButton - askedFeature) / 1000}s apart`)

  let view = await until("both generating", (v) => v.sessions.length === 2)
  sessionIds.push(...view.sessions.map((s) => s.id))
  await page.mouse.move(720, 400)
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight * 0.45 }))
  await shot("two-generating")
  await pin(1).click()
  await shot("card-generating")

  view = await until("both settled", (v) => v.sessions.length === 2 && v.sessions.every(settled))
  const done = Date.now()
  log("both settled after", `${(done - askedFeature) / 1000}s`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(2500)
  await shot("both-ready")

  await pin(1).click()
  await row("B").click()
  await until(
    "feature on B",
    (v) => v.sessions[0]?.place.kind === "shown" && v.sessions[0].place.variant === "v2",
  )
  await page.waitForTimeout(2500)
  await shot("feature-flipped-B")

  await page.keyboard.press("]")
  await page.waitForTimeout(800)
  await page.keyboard.press("2")
  await until(
    "button on B",
    (v) => v.sessions[1]?.place.kind === "shown" && v.sessions[1].place.variant === "v2",
  )
  await page.waitForTimeout(2500)
  await shot("button-flipped-B")

  view = await bridge("page")
  log("files", JSON.stringify(view.sessions.map((s) => s.variants.map((v) => v.files))))

  await page.keyboard.press("s")
  await page.waitForTimeout(1200)
  await shot("specs-variant-delta")
  await page.keyboard.press("s")

  await page.reload({ waitUntil: "networkidle" })
  await page.waitForSelector("morph-root", { state: "attached" })
  await page.waitForTimeout(500)
  await page.keyboard.press("Alt+Shift+R")
  await pin(2).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  await shot("rejoined-after-reload")

  await pin(2).click()
  await card().getByRole("button", { name: /^Keep/ }).click()
  await until("button kept", (v) => v.sessions.length === 1)
  await page.waitForTimeout(800)
  await shot("kept-button")

  const hero = page.locator("section", { hasText: "Ship the work" }).locator("h1")
  await askAbout(hero, "Make the headline bolder and tighter")
  await page.waitForTimeout(1200)
  await shot("hero-generating")
  view = await until("hero settled", (v) => v.sessions.length === 2 && v.sessions.every(settled))
  sessionIds.push(...view.sessions.map((s) => s.id).filter((id) => !sessionIds.includes(id)))
  await page.waitForTimeout(2500)
  log("places", JSON.stringify(view.sessions.map((s) => s.place)))
  await shot("hero-ready-sharing-a-file")

  await scrollTo(hero)
  await pin(3).click()
  await page.keyboard.press("1")
  await until("feature waits on hero", (v) => v.sessions.some((s) => s.place.kind === "waiting"))
  await page.waitForTimeout(2500)
  await shot("hero-takes-the-file")
  await chip("FeatureCard").click()
  await page.waitForTimeout(1200)
  await shot("feature-waiting")

  await page.keyboard.press("2")
  await until("feature takes it back", (v) => v.sessions[0]?.place.kind === "shown")
  await page.waitForTimeout(2500)
  await shot("feature-took-it-back")

  await card().getByRole("button", { name: "Discard" }).click()
  await until("feature discarded", (v) => v.sessions.length === 1)
  await page.waitForTimeout(2500)
  await shot("hero-returns-after-discard")
  await chip("Headline").click()
  await card().getByRole("button", { name: "Discard" }).click()
  await until("all discarded", (v) => v.sessions.length === 0)
  await page.waitForTimeout(1500)
  await shot("all-discarded")
} catch (error) {
  await shot("failed-here").catch(() => {})
  throw error
} finally {
  const left = await bridge("page").catch(() => ({ sessions: [] }))
  for (const session of left.sessions) await bridge("discard", { id: session.id }).catch(() => {})
  await browser.close()
}

if (errors.length > 0) {
  console.error(`page errors:\n${errors.join("\n")}`)
  process.exitCode = 1
}
