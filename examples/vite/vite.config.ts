import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tune } from "@enitrat/tune/vite"
import { defineConfig } from "vite"

import tuneConfig from "./tune.config.ts"

export default defineConfig({
  plugins: [react(), tailwindcss(), tune(tuneConfig)],
})
