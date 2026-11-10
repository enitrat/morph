import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { morph } from "@enitrat/morph/vite"
import { defineConfig } from "vite"

import morphConfig from "./morph.config.ts"

export default defineConfig({
  plugins: [react(), tailwindcss(), morph(morphConfig)],
})
