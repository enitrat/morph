import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __TUNE_UI_CSS__: '""' },
  test: { environment: "node", clearMocks: true },
})
