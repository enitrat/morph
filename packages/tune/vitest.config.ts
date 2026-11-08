import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __TUNE_UI_CSS__: '""', __TUNE_UI_FONTS__: '{ "sans": "", "mono": "" }' },
  test: { environment: "node", clearMocks: true },
})
