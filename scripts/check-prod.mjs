// Builds both examples for production and fails if any output file holds a Tune-specific string:
// Tune must run in development only and leave nothing in a production build.
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const TELLTALES = [
  "tune-widget-c0rr3ct10n",
  "tune-root",
  "x-tune",
  "/api/tune",
  "/__tune",
  "virtual:tune",
  "mountTune",
  "TuneWidget",
  "@enitrat/tune",
  "packages/tune/",
]
const EXAMPLES = [
  { name: "next-example", out: "examples/next/.next", skip: ["cache", "dev"] },
  { name: "vite-example", out: "examples/vite/dist", skip: [] },
]

function filesIn(dir, skip) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.includes(entry.name)) return []
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesIn(path, []) : [path]
  })
}

/** The files a source map lists, its sections' included. */
function sourcesOf(map) {
  const parsed = JSON.parse(map)
  return [
    ...(parsed.sources ?? []),
    ...(parsed.sections ?? []).flatMap((section) => section.map?.sources ?? []),
  ]
}

let failed = false
for (const { name, out, skip } of EXAMPLES) {
  rmSync(join(ROOT, out), { recursive: true, force: true })
  execFileSync("pnpm", ["--filter", name, "build"], { cwd: ROOT, stdio: "inherit" })
  const files = filesIn(join(ROOT, out), skip)
  // A source map holds the app's own source text, where the dev-only branch that mounts Tune is
  // written; only the files it lists show what was bundled.
  const text = files.map((file) => {
    const body = readFileSync(file, "latin1")
    return [file, file.endsWith(".map") ? JSON.stringify(sourcesOf(body)) : body]
  })
  if (!text.some(([, body]) => body.includes("Explore ideas in your React app.")))
    throw new Error(
      `${name}: no output file holds the page, so the search looked in the wrong place`,
    )
  const hits = text.flatMap(([file, body]) =>
    TELLTALES.filter((telltale) => body.includes(telltale)).map(
      (telltale) => `${file}: ${telltale}`,
    ),
  )
  console.log(`${name}: ${files.length} files, ${hits.length} Tune strings`)
  for (const hit of hits) console.error(`  ${hit}`)
  failed ||= hits.length > 0
}
process.exit(failed ? 1 : 0)
