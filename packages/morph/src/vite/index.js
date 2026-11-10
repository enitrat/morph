import { serve } from "./server"

const VIRTUAL = "virtual:morph"
const RESOLVED = `\0${VIRTUAL}`

/** @type {typeof import("./index").morph} */
export function morph(config, { base = "/__morph", inject = true } = {}) {
  return {
    name: "morph",
    apply: "serve",
    // The widget reads the app's fibers from its own React root; one copy of React serves both.
    // Vite serves its TypeScript as source, and the dependency scan cannot see the virtual module
    // that imports it, so its own dependency is pre-bundled up front rather than found late, which
    // would reload the first page.
    config: () => ({
      resolve: { dedupe: ["react", "react-dom"] },
      optimizeDeps: { include: ["@enitrat/morph > zod"] },
    }),
    configureServer(server) {
      serve(server, config, base)
    },
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load: (id) =>
      id === RESOLVED
        ? `import { mountMorph } from "@enitrat/morph/widget"\nmountMorph(${JSON.stringify(base)})\n`
        : undefined,
    transformIndexHtml: () =>
      inject
        ? [{ tag: "script", attrs: { type: "module", src: `/@id/${VIRTUAL}` }, injectTo: "body" }]
        : [],
  }
}
