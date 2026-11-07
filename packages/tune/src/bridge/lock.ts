// oxlint-disable-next-line import/no-nodejs-modules -- the lock is a directory on disk.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname, join } from "node:path"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { setTimeout as sleep } from "node:timers/promises"

import { absent } from "./git"

const WAIT_MS = 30_000

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/**
 * Takes the lock at `dir` for this process, or answers false while a live process holds it. A lock
 * whose holder is dead is broken. The pid is written before the directory appears, so a lock never
 * exists without its holder.
 */
export async function tryLock(dir: string): Promise<boolean> {
  await mkdir(dirname(dir), { recursive: true })
  const staged = `${dir}.${randomUUID()}`
  await mkdir(staged)
  await writeFile(join(staged, "pid"), String(process.pid))
  try {
    await rename(staged, dir)
    return true
  } catch (error) {
    await rm(staged, { recursive: true, force: true })
    const { code } = error as NodeJS.ErrnoException
    if (code !== "ENOTEMPTY" && code !== "EEXIST") throw error
  }
  const holder = await readFile(join(dir, "pid"), "utf8").catch(absent)
  if (holder !== null && alive(Number(holder))) return false
  const tomb = `${dir}.dead-${randomUUID()}`
  await rename(dir, tomb).catch(absent)
  await rm(tomb, { recursive: true, force: true })
  return tryLock(dir)
}

export async function unlock(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

export async function withLock<T>(dir: string, body: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + WAIT_MS
  while (!(await tryLock(dir))) {
    if (Date.now() > deadline) throw new Error(`tune: ${dir} is held by another process`)
    await sleep(20)
  }
  try {
    return await body()
  } finally {
    await unlock(dir)
  }
}
