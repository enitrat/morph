import { type TuneConfigInput } from "@enitrat/tune/config"
export default {
  tokens: {
    kind: "css",
    files: ["examples/shared/styles.css"],
    themes: { shared: [], list: [{ name: "light", selectors: [":root"] }] },
  },
  components: [
    {
      kind: "files",
      files: "examples/shared/ui/*.tsx",
      group: "ui",
      naming: "own",
      href: null,
      importFrom: "example-shared/ui/{slug}",
      props: "cva",
    },
  ],
  plumbing: [],
  checks: {
    lint: null,
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "workspace" },
  },
} satisfies TuneConfigInput
