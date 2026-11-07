// oxlint-disable-next-line import/no-nodejs-modules -- sessions and jobs live on disk.
import { randomUUID } from "node:crypto"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { dirname } from "node:path"

import { type z } from "zod"

import { absent } from "./git"

/** Writes through a sibling tmp file and a rename, so a reader sees the old file or the new one. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}`
  await writeFile(tmp, JSON.stringify(value))
  await rename(tmp, file)
}

export async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
  const text = await readFile(file, "utf8").catch(absent)
  return text === null ? null : schema.parse(JSON.parse(text))
}
