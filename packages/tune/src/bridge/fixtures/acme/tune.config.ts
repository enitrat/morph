import { type TuneConfigInput } from "../../../core/config"

/** The acme fixture's design system: a `packages/ui` library consumed by `apps/site`. */
export default {
  tokens: {
    kind: "css",
    files: ["packages/ui/src/tokens/*.css", "packages/ui/src/components/*/*/*.tokens.css"],
    tiers: [
      { files: "packages/ui/src/tokens/primitives.css", tier: "primitive" },
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
      meta: "packages/ui/src/components/atoms/*/*.meta.ts",
      group: "atom",
      naming: "own",
      href: "/components/{slug}",
      importFrom: "@acme/ui",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "packages/ui/src/components/molecules/*/*.meta.ts",
      group: "molecule",
      naming: "nearest",
      href: "/components/{slug}",
      importFrom: "@acme/ui",
      props: "lab-meta",
    },
    {
      kind: "lab-meta",
      meta: "packages/ui/src/components/organisms/*/*.meta.ts",
      group: "block",
      naming: "container",
      href: "/components/{slug}",
      importFrom: null,
      props: "lab-meta",
    },
  ],
  plumbing: [{ prefix: "packages/ui/src/", except: ["/examples/"] }],
  checks: {
    lint: null,
    format: { bin: "oxfmt", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "workspace" },
  },
} satisfies TuneConfigInput
