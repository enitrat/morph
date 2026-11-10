#!/usr/bin/env node
// `morph status | discard | gc`: the hatch for when the overlay cannot answer, for example
// after a shown variant broke the page that hosts it.
// oxlint-disable-next-line import/no-nodejs-modules -- a CLI.
import { existsSync } from "node:fs"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { git, openRepo, REFS } from "../bridge/git"
import { tryLock, unlock } from "../bridge/lock"
import { discard, openSessions, page } from "../bridge/session"
import { SLOT_IDS, slotsRoot } from "../bridge/slots"
import { setupNext } from "./setup-next"
import { doctor } from "./doctor"

async function main() {
  if (process.argv[2] === "doctor") {
    if (process.argv.length > 3) {
      console.error("usage: morph doctor")
      process.exit(2)
    }
    process.exitCode = (await doctor(process.cwd())) ? 0 : 1
    return
  } else if (process.argv[2] === "setup-next") {
    await setupNext(process.cwd())
    return
  }

  const repo = await openRepo(process.cwd())

  async function status() {
    const answer = await page(repo)
    if (!answer.ok) throw new Error(`morph: the page did not settle: ${JSON.stringify(answer)}`)
    const { sessions, stuck } = answer.value
    if (stuck.length > 0) console.log(`stuck on: ${stuck.join(", ")}`)
    for (const { id, place, variants } of sessions) {
      const where =
        place.kind === "shown"
          ? `shows ${place.variant}${place.edited ? " (edited)" : ""}`
          : place.kind === "waiting"
            ? `waits to show ${place.variant} on ${place.on.map((hold) => `${hold.session} (${hold.files.join(", ")})`).join("; ")}`
            : place.kind === "conflict"
              ? `wants ${place.want}, conflicts in ${place.files.join(", ")}`
              : "shows the original"
      console.log(`session ${id}: ${where}`)
      for (const variant of variants) {
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
    const left = await page(repo)
    if (left.ok && left.value.stuck.length > 0) {
      console.log(`the live tree is stuck on: ${left.value.stuck.join(", ")}`)
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
      if (!existsSync(dir)) continue
      const lock = await tryLock(`${dir}.lock`)
      if (!lock) continue
      try {
        await git(repo.root, ["worktree", "remove", "--force", dir])
        slots++
      } finally {
        await unlock(lock)
      }
    }
    await git(repo.root, ["worktree", "prune"])
    console.log(`removed ${refs.length} refs and ${slots} idle slots`)
  }

  const COMMANDS: Record<string, () => Promise<void>> = { status, discard: discardAll, gc }
  const command = COMMANDS[process.argv[2] ?? ""]
  if (command === undefined) {
    console.error("usage: morph doctor | setup-next | status | discard | gc")
    process.exit(2)
  }
  await command()
}
await main()
