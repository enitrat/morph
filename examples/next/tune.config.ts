import { type TuneConfigInput } from "@enitrat/tune/config"

/** Globs are relative to the git root, two folders up; the design system is `examples/acme`. */
export default {
  tokens: {
    kind: "css",
    files: ["examples/acme/tokens/*.css", "examples/acme/*/*/*.tokens.css"],
    tiers: [
      { files: "examples/acme/tokens/primitives.css", tier: "primitive" },
      { files: "**/*.tokens.css", tier: "component" },
    ],
    themes: {
      shared: [":root", ":where(:root, .light, .dark)"],
      list: [
        { name: "light", selectors: [":root, .light", ".light"] },
        { name: "dark", selectors: [".dark"], fallback: "light" },
      ],
    },
  },
  components: [
    {
      kind: "lab-meta",
      meta: "examples/acme/atoms/*/*.meta.ts",
      group: "atom",
      naming: "own",
      href: null,
      importFrom: "acme",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "examples/acme/molecules/*/*.meta.ts",
      group: "molecule",
      naming: "nearest",
      href: null,
      importFrom: "acme",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "examples/acme/organisms/*/*.meta.ts",
      group: "block",
      naming: "container",
      href: null,
      importFrom: "acme",
      props: "lab-meta",
    },
  ],
  plumbing: [{ prefix: "examples/acme/", except: [] }],
  checks: {
    lint: null,
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "workspace" },
  },
} satisfies TuneConfigInput
