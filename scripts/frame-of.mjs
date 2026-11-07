// Prints "<chunk url>:<line>:<col> <repo path>:<line>": a generated position in a chunk the dev
// server at <origin> serves for <page>, whose source map points into <repo path>.
// Usage: node frame-of.mjs <origin> <page> <repo path>
import { SourceMapConsumer } from "source-map-js"

const [origin, page, path] = process.argv.slice(2)
const html = await (await fetch(new URL(page, origin))).text()
const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(
  ([, src]) => new URL(src, origin).href,
)
for (const chunk of new Set(chunks)) {
  const js = await (await fetch(chunk)).text()
  const link = [...js.matchAll(/\/\/# sourceMappingURL=(\S+)\s*$/gm)].at(-1)?.[1]
  if (link === undefined) continue
  const response = await fetch(new URL(link, chunk))
  if (!response.ok) continue
  const map = new SourceMapConsumer(await response.json())
  const hits = []
  map.eachMapping((mapping) => {
    if (mapping.source?.endsWith(path) && mapping.originalLine !== null)
      hits.push(
        `${chunk}:${mapping.generatedLine}:${mapping.generatedColumn + 1} ${path}:${mapping.originalLine}`,
      )
  })
  if (hits.length > 0) {
    console.log(hits[Math.floor(hits.length / 2)])
    process.exit(0)
  }
}
console.error(`no chunk of ${page} maps into ${path} (${chunks.length} chunks)`)
process.exit(1)
