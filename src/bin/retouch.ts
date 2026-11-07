// `pnpm retouch status | discard | gc`: the hatch for when the overlay cannot answer, for example
// after a shown variant broke the page that hosts it.
// oxlint-disable-next-line import/no-nodejs-modules -- a CLI.
import { existsSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { git, openRepo, REFS } from "../bridge/git"
import { recoverLive, setLive } from "../bridge/live"
import { tryLock, unlock } from "../bridge/lock"
import { discard, openSessions, readSession } from "../bridge/session"
import { SLOT_IDS, slotsRoot } from "../bridge/slots"

const repo = await openRepo(process.cwd())

async function status() {
  const journal = await recoverLive(repo)
  const applied = journal.kind === "moving" ? journal.to : journal.applied
  console.log(
    applied === null
      ? "live: no variant shown"
      : `live: ${applied.session} ${applied.variant} (${applied.files.map((file) => file.path).join(", ")})`,
  )
  if (journal.kind === "stuck") console.log(`stuck on: ${journal.conflicts.join(", ")}`)
  for (const id of await openSessions(repo)) {
    const view = await readSession(repo, id)
    console.log(`session ${id}`)
    for (const variant of view?.variants ?? []) {
      const detail =
        variant.state === "ready"
          ? `${variant.title} (+${variant.stat.add} -${variant.stat.del})`
          : variant.state === "failed"
            ? variant.reason.replaceAll("\n", " · ")
            : variant.phase
      console.log(`  ${variant.id} ${variant.state}: ${detail}`)
    }
  }
}

async function discardAll() {
  for (const id of await openSessions(repo)) {
    const done = await discard(repo, id)
    console.log(done.ok ? `discarded ${id}` : `could not discard ${id}: ${JSON.stringify(done)}`)
    if (!done.ok) process.exitCode = 1
  }
  const left = await setLive(repo, null)
  if (!left.ok) {
    console.log(`the live tree is stuck on: ${left.conflicts.join(", ")}`)
    process.exitCode = 1
  }
}

/** Deletes the refs of sessions that no longer exist and the worktrees of idle slots. */
async function gc() {
  const open = new Set<string>(await openSessions(repo))
  const refs = (await git(repo.root, ["for-each-ref", "--format=%(refname)", `${REFS}/`]))
    .toString()
    .split("\n")
    .filter((ref) => ref !== "" && !open.has(ref.slice(REFS.length + 1).split("/")[0] ?? ""))
  for (const ref of refs) await git(repo.root, ["update-ref", "-d", ref])
  const root = await slotsRoot(repo)
  let slots = 0
  for (const id of SLOT_IDS) {
    const dir = join(root, `slot-${id}`)
    if (!existsSync(dir) || !(await tryLock(`${dir}.lock`))) continue
    try {
      await git(repo.root, ["worktree", "remove", "--force", dir])
      slots++
    } finally {
      await unlock(`${dir}.lock`)
    }
  }
  await git(repo.root, ["worktree", "prune"])
  console.log(`removed ${refs.length} refs and ${slots} idle slots`)
}

const COMMANDS: Record<string, () => Promise<void>> = { status, discard: discardAll, gc }
const command = COMMANDS[process.argv[2] ?? ""]
if (command === undefined) {
  console.error("usage: pnpm retouch status | discard | gc")
  process.exit(2)
}
await command()
