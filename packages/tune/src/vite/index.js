// Plain JavaScript: Vite loads its config's dependencies with Node, which runs no TypeScript from
// node_modules. The bridge is TypeScript, so it loads through tsx once the dev server starts.
import { tsImport } from "tsx/esm/api"

const VIRTUAL = "virtual:tune"
const RESOLVED = `\0${VIRTUAL}`

/** @type {typeof import("./index").tune} */
export function tune(config, { base = "/__tune", inject = true } = {}) {
  return {
    name: "tune",
    apply: "serve",
    // The widget reads the app's fibers from its own React root; one copy of React serves both.
    // Vite serves its TypeScript as source, and the dependency scan cannot see the virtual module
    // that imports it, so its own dependency is pre-bundled up front rather than found late, which
    // would reload the first page.
    config: () => ({
      resolve: { dedupe: ["react", "react-dom"] },
      optimizeDeps: { include: ["@enitrat/tune > zod"] },
    }),
    async configureServer(server) {
      const { serve } = await tsImport("./server.ts", import.meta.url)
      serve(server, config, base)
    },
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load: (id) =>
      id === RESOLVED
        ? `import { mountTune } from "@enitrat/tune/widget"\nmountTune(${JSON.stringify(base)})\n`
        : undefined,
    transformIndexHtml: () =>
      inject
        ? [{ tag: "script", attrs: { type: "module", src: `/@id/${VIRTUAL}` }, injectTo: "body" }]
        : [],
  }
}
