import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { lab } from "./tools/lab-plugin.ts"
import { scenes } from "./tools/scenes-plugin.ts"

// The build ships React's development build (`NODE_ENV=development vite build --mode
// development`): the overlay reads fiber `_debugStack` and owner names, which only that build
// fills. Minified names would read as `mt` in the overlay, so names are kept. Source maps ship
// because the replay's `locate` reads them. JSX compiles to plain `jsx()`, which React's dev
// build still gives a `_debugStack`: `jsxDEV()` would embed each file's absolute build path.
export default defineConfig({
  oxc: { jsx: { development: false } },
  plugins: [
    react(),
    tailwindcss(),
    scenes({
      scenes: fileURLToPath(new URL("./scenes", import.meta.url)),
      repo: fileURLToPath(new URL("..", import.meta.url)),
    }),
    lab({
      dir: fileURLToPath(new URL("./lab/saved", import.meta.url)),
      root: fileURLToPath(new URL("..", import.meta.url)),
    }),
  ],
  build: {
    sourcemap: true,
    minify: "oxc",
    rolldownOptions: { output: { keepNames: true } },
  },
})
