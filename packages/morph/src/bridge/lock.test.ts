import { spawn, spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

import { tryLock, unlock, withLock } from "./lock"

it("refuses a live holder, recovers a dead holder, and ignores an old release", async () => {
  const root = await mkdtemp(join(tmpdir(), "morph-lock-test-"))
  const dir = join(root, "lock")
  try {
    const first = await tryLock(dir)
    expect(first).not.toBeNull()
    expect(await tryLock(dir)).toBeNull()
    if (!first) throw new Error("lock unavailable")
    await unlock(first)
    const second = await tryLock(dir)
    expect(second).not.toBeNull()
    await unlock(first)
    expect(await tryLock(dir)).toBeNull()
    if (!second) throw new Error("lock unavailable")
    await unlock(second)

    const dead = spawnSync("true").pid
    await writeFile(join(dir, `${dead}-dead`), "1")
    const recovered = await tryLock(dir)
    expect(recovered).not.toBeNull()
    if (recovered) await unlock(recovered)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("keeps concurrent callers out of the critical section", async () => {
  const root = await mkdtemp(join(tmpdir(), "morph-lock-test-"))
  let inside = 0
  try {
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let i = 0; i < 30; i++) {
          await withLock(join(root, "lock"), async () => {
            expect(++inside).toBe(1)
            await new Promise((resolve) => setTimeout(resolve, 1))
            inside--
          })
        }
      }),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("keeps separate processes out of the critical section", async () => {
  const root = await mkdtemp(join(tmpdir(), "morph-lock-test-"))
  const modulePath = fileURLToPath(new URL("./lock.ts", import.meta.url))
  const script = `
    import { mkdir, rmdir } from 'node:fs/promises';
    import { withLock } from ${JSON.stringify(modulePath)};
    for (let i = 0; i < 30; i++) {
      await withLock(process.argv[1] + '/lock', async () => {
        await mkdir(process.argv[1] + '/inside');
        await new Promise(resolve => setTimeout(resolve, 1));
        await rmdir(process.argv[1] + '/inside');
      });
    }
  `
  try {
    const results = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
            const child = spawn(process.execPath, [
              "--import",
              "tsx",
              "--input-type=module",
              "-e",
              script,
              root,
            ])
            let stderr = ""
            child.stderr.on("data", (chunk: Buffer) => {
              stderr += chunk.toString()
            })
            child.on("error", reject)
            child.on("close", (code) => resolve({ code, stderr }))
          }),
      ),
    )
    expect(results).toEqual(Array.from({ length: 4 }, () => ({ code: 0, stderr: "" })))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it("recovers locks and unfinished contenders after their process dies", async () => {
  const root = await mkdtemp(join(tmpdir(), "morph-lock-test-"))
  const dir = join(root, "lock")
  const modulePath = fileURLToPath(new URL("./lock.ts", import.meta.url))
  try {
    for (const state of ["held", "choosing"]) {
      const script = `
        import { mkdir, writeFile } from 'node:fs/promises';
        import { tryLock } from ${JSON.stringify(modulePath)};
        const dir = process.argv[1];
        if (process.argv[2] === 'held') {
          if (!await tryLock(dir)) process.exit(1);
        } else {
          await mkdir(dir, { recursive: true });
          await writeFile(dir + '/' + process.pid + '-abandoned', 'choosing');
        }
        console.log('ready');
        setInterval(() => {}, 1000);
      `
      const child = spawn(process.execPath, [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        script,
        dir,
        state,
      ])
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve())
        child.once("error", reject)
        child.once("exit", (code) => reject(new Error(`child exited before ready: ${code}`)))
      })
      try {
        expect(await tryLock(dir)).toBeNull()
      } finally {
        const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
        child.kill("SIGKILL")
        await exited
      }
      const recovered = await tryLock(dir)
      expect(recovered).not.toBeNull()
      if (recovered) await unlock(recovered)
    }
    await writeFile(join(dir, "pid"), String(process.pid))
    expect(await tryLock(dir)).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
