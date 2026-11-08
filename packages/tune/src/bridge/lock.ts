// oxlint-disable-next-line import/no-nodejs-modules -- locks coordinate processes on disk.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises"
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

/** The unique contender file owned by one acquisition. */
export type Lock = { readonly path: string }

/** Attempts to take a lock, returning its ownership handle or null when busy. */
export async function tryLock(dir: string): Promise<Lock | null> {
  await mkdir(dir, { recursive: true })
  const name = `${process.pid}-${randomUUID()}`
  const path = join(dir, name)
  const staged = join(dirname(dir), `.tune-lock-${randomUUID()}`)
  const publish = async (value: string) => {
    await writeFile(staged, value)
    await rename(staged, path)
  }
  try {
    await publish("choosing")
    const contenders = async () => {
      const entries = await readdir(dir)
      return Promise.all(
        entries
          .filter((entry) => entry !== name)
          .map(async (entry) => {
            const other = join(dir, entry)
            const pid =
              entry === "pid"
                ? Number(await readFile(other, "utf8").catch(absent))
                : Number(entry.split("-")[0])
            if (!pid || !alive(pid)) {
              await rm(other, { force: true })
              return null
            }
            const value = entry === "pid" ? "legacy" : await readFile(other, "utf8").catch(absent)
            return value === null ? null : { name: entry, value }
          }),
      )
    }
    const initial = await contenders()
    const tickets = initial.flatMap((entry) =>
      entry && /^\d+$/.test(entry.value) ? [Number(entry.value)] : [],
    )
    const ticket = Math.max(0, ...tickets) + 1
    await publish(String(ticket))
    const current = await contenders()
    // Choosing precedes ticket selection. A later contender must see this ticket, while an
    // earlier choosing contender makes us withdraw. Equal tickets are ordered by unique name.
    if (
      current.some(
        (entry) =>
          entry &&
          (entry.value === "choosing" ||
            entry.value === "legacy" ||
            Number(entry.value) < ticket ||
            (Number(entry.value) === ticket && entry.name < name)),
      )
    ) {
      await rm(path, { force: true })
      return null
    }
    return { path }
  } catch (error) {
    await rm(path, { force: true })
    // `dropLock` removed the folder between our mkdir and rename: the next try makes it again.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  } finally {
    await rm(staged, { force: true })
  }
}

export async function unlock(lock: Lock): Promise<void> {
  await rm(lock.path, { force: true })
}

/** Removes a lock's folder once nobody holds or wants it; a contender keeps it. */
export async function dropLock(dir: string): Promise<void> {
  try {
    await rmdir(dir)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error
  }
}

export async function withLock<T>(dir: string, body: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + WAIT_MS
  let lock = await tryLock(dir)
  while (lock === null) {
    if (Date.now() > deadline) throw new Error(`tune: ${dir} is held by another process`)
    await sleep(20)
    lock = await tryLock(dir)
  }
  try {
    return await body()
  } finally {
    await unlock(lock)
  }
}
