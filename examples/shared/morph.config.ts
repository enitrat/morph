export default {
  pathBase: "repo" as const,
  tokens: {
    kind: "css" as const,
    files: ["examples/shared/styles.css"],
    themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
  },
  components: [
    {
      kind: "files" as const,
      files: "examples/shared/ui/*.tsx",
      importFrom: "example-shared/ui/{slug}",
    },
  ],
  checks: {
    lint: null,
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "workspace" as const },
  },
}
