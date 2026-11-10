import { defineConfig } from "vitest/config"

export default defineConfig({
  define: { __MORPH_UI_CSS__: '""', __MORPH_UI_FONTS__: '{ "sans": "", "mono": "" }' },
  test: { environment: "node", clearMocks: true },
})
