import { type TuneConfigInput } from "@enitrat/tune/config"

/** Globs are relative to the git root, which is the folder above this one. */
export default {
  tokens: {
    kind: "css",
    files: ["example/ui/tokens/*.css", "example/ui/*/*/*.tokens.css"],
    tiers: [
      { files: "example/ui/tokens/primitives.css", tier: "primitive" },
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
      meta: "example/ui/atoms/*/*.meta.ts",
      group: "atom",
      naming: "own",
      href: null,
      importFrom: "@/ui",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "example/ui/molecules/*/*.meta.ts",
      group: "molecule",
      naming: "nearest",
      href: null,
      importFrom: "@/ui",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "example/ui/organisms/*/*.meta.ts",
      group: "block",
      naming: "container",
      href: null,
      importFrom: "@/ui",
      props: "lab-meta",
    },
  ],
  plumbing: [{ prefix: "example/ui/", except: [] }],
  checks: {
    lint: null,
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "workspace" },
  },
} satisfies TuneConfigInput
