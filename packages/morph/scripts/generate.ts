// Runs one Morph ask headless, re-checks each captured variant ref in a slot, and fails if the live
// tree moved. Run it from the host checkout, which holds `morph.config.ts`:
//   tsx scripts/generate.ts <repo path> <line> <col> "<words>" [--keep]
// `--keep` leaves the session open for `pnpm morph`.
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { pathToFileURL } from "node:url"

import { checks } from "../src/bridge/checks"
import { readPlan } from "../src/bridge/planner"
import { readJobs } from "../src/bridge/jobs"
import { git, openRepo, snapshot, variantRef } from "../src/bridge/git"
import { ask, discard } from "../src/bridge/session"
import { acquire, release } from "../src/bridge/slots"
import { MorphConfig } from "../src/core/config"
import { RepoPath, SessionId, variantsOf } from "../src/variant/model"

const [path, line, col, words] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
if (path === undefined || words === undefined)
  throw new Error('usage: generate.ts <repo path> <line> <col> "<words>" [--keep]')

const opened = await openRepo(process.cwd())
const { default: input } = (await import(
  pathToFileURL(join(opened.root, "morph.config.ts")).href
)) as { default: unknown }
const repo = { ...opened, config: MorphConfig.parse(input) }
const tree = async () =>
  (await git(repo.root, ["rev-parse", `${await snapshot(repo)}^{tree}`])).toString().trim()
const FILE = RepoPath.parse(path)
const id = SessionId.parse(randomUUID())
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const liveBefore = await tree()
const t0 = performance.now()
const asked = await ask(repo, {
  id,
  words,
  targets: [{ source: { path: FILE, line: Number(line), col: Number(col) }, owner: [], text: "" }],
  marks: [],
  count: 3,
})
if (!asked.ok) throw new Error(`ask refused: ${JSON.stringify(asked)}`)
console.log(`ask answered in ${seconds(performance.now() - t0)} (accepted)`)
let round = await readPlan(repo, id)
while (round?.kind === "planning" && round.plan.state.kind !== "failed") {
  await sleep(250)
  round = await readPlan(repo, id)
}
if (round?.kind !== "active")
  throw new Error(
    round?.kind === "planning" && round.plan.state.kind === "failed"
      ? round.plan.state.reason
      : "The round closed before planning completed",
  )
const session = round.session
for (const { id: variant, direction } of variantsOf(session))
  console.log(`  ${variant}: ${direction.title}: ${direction.description}`)

/** Each variant's result, read without settling the page, so nothing is shown on the live tree. */
const results = async () => {
  const jobs = await readJobs(repo, id)
  if (jobs === null) throw new Error("The round closed before generation completed")
  return variantsOf(session).map(({ id: variant }) => ({ id: variant, job: jobs[variant]?.state }))
}

let firstReady: number | undefined
let jobs = await results()
for (;;) {
  if (firstReady === undefined && jobs.some(({ job }) => job?.kind === "ready"))
    firstReady = performance.now() - t0
  if (jobs.every(({ job }) => job?.kind === "ready" || job?.kind === "failed")) break
  await sleep(1000)
  jobs = await results()
}
console.log(`first ready ${firstReady === undefined ? "never" : seconds(firstReady)} after ask`)

let failures = 0
for (const { id: variantId, job } of jobs) {
  if (job?.kind !== "ready") {
    failures++
    console.log(`${variantId} failed: ${job?.kind === "failed" ? job.reason : ""}`)
    continue
  }
  const variant = { id: variantId, ...job }
  const commit = (await git(repo.root, ["rev-parse", variantRef(id, variant.id)])).toString().trim()
  const result = (await git(repo.root, ["cat-file", "-t", commit])).toString().trim()
  const slot = await acquire(repo, session.base)
  let rechecked
  try {
    await git(slot.dir, ["checkout", "--quiet", "--detach", "--force", commit])
    const start = performance.now()
    rechecked = await checks(slot.dir, variant.files, repo.config, AbortSignal.any([]))
    rechecked = { ...rechecked, ms: performance.now() - start }
    const dirty = (await git(slot.dir, ["status", "--porcelain"])).toString()
    if (dirty !== "")
      rechecked = { ok: false, errors: `checks rewrote the captured files:\n${dirty}` }
  } finally {
    await release(slot)
  }
  const { ms } = job
  console.log(
    `${variant.id} ready "${variant.title}": ref ${variantRef(id, variant.id)} = ${result} ${commit.slice(0, 9)}`,
    `\n  agent ${seconds(ms.agent)}, checks ${seconds(ms.checks)}, job ${seconds(ms.total)}`,
    `\n  +${variant.stat.add} -${variant.stat.del} in ${variant.files.join(", ")}`,
    `\n  re-check on the ref: ${rechecked.ok ? "clean, files unchanged" : `FAILED\n${"errors" in rechecked ? rechecked.errors : ""}`}`,
  )
  if (!rechecked.ok) failures++
}

const liveAfter = await tree()
console.log(
  liveAfter === liveBefore
    ? `live tree unchanged (tree ${liveAfter.slice(0, 9)})`
    : "LIVE TREE CHANGED",
)
if (liveAfter !== liveBefore) failures++

if (!process.argv.includes("--keep")) {
  const dropped = await discard(repo, id)
  if (!dropped.ok) throw new Error(`discard refused: ${JSON.stringify(dropped)}`)
  console.log(`session ${id} discarded`)
} else console.log(`session ${id} left open`)
process.exit(failures === 0 ? 0 : 1)
