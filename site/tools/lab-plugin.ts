import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"

import { type Plugin } from "vite"

const body = async (stream: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

/** Dev-only: the lab saves configs as JSON under `dir`, and lists them back. */
export function lab({ dir, root }: { dir: string; root: string }): Plugin {
  return {
    name: "morph-lab",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__lab/save", async (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end()
        const config: unknown = JSON.parse(await body(req))
        if (
          typeof config !== "object" ||
          config === null ||
          !("mode" in config) ||
          !("seed" in config) ||
          typeof config.mode !== "string" ||
          !/^[a-z]+$/.test(config.mode) ||
          typeof config.seed !== "number"
        )
          return void res.writeHead(400).end("Expected a config with a mode and a seed")
        await mkdir(dir, { recursive: true })
        const file = join(dir, `${config.mode}-${config.seed}.json`)
        await writeFile(file, `${JSON.stringify(config, null, 2)}\n`)
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ path: relative(root, file) }))
      })
      server.middlewares.use("/__lab/saved", async (_req, res) => {
        const names = await readdir(dir).catch(() => [])
        const saved = await Promise.all(
          names
            .filter((name) => name.endsWith(".json"))
            .toSorted()
            .map(async (name) => ({
              name: name.replace(/\.json$/, ""),
              config: JSON.parse(await readFile(join(dir, name), "utf8")) as unknown,
            })),
        )
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify(saved))
      })
    },
  }
}
