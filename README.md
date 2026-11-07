# Tune

Tune is a development-only overlay for a React app. Point at an element and describe a change.
Tune asks the `claude` CLI for a few variants, builds each one in its own git worktree, and lets
you flip between them on the live page. You can then fine-tune the result: step a design token,
a Tailwind utility or a component prop. Keep the variant you like and discard the rest.

Tune writes only to your working tree, and only while `next dev` runs.

## Requirements

- React 19 in development, on Next.js with the App Router. Server Components and client
  components both work.
- A git checkout. Variants are built in worktrees and kept as refs.
- Design tokens as CSS custom properties, Tailwind CSS 4 style (`@theme`, `:root`, `.dark`).
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), signed in, on your `PATH`.

## Try it

`examples/next/` is a Next app with a small design system and Tune already set up. From this repo:

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000 and press Alt+Shift+R.

## Install

```sh
pnpm add -D github:enitrat/tune
```

## Set it up

1. Describe your design system in `tune.config.ts` at your app's root, the folder that holds
   `app/`. Every path in it is relative to the git root, which differs from the app's root when
   the app sits in a monorepo. See the example below. The schema is `TuneConfigInput`:

   ```ts
   import { type TuneConfigInput } from "@enitrat/tune/config"

   export default { /* … */ } satisfies TuneConfigInput
   ```

2. Add the bridge route at `app/api/tune/[op]/route.dev.ts`:

   ```ts
   import { tuneRoute } from "@enitrat/tune/next"

   import config from "../../../../tune.config"

   export const { GET, POST, OPTIONS } = tuneRoute(config)
   ```

   Then let Next compile Tune and serve `.dev.ts` routes only under `next dev`, so no production
   build contains the bridge. In `next.config.mjs`:

   ```js
   export default {
     transpilePackages: ["@enitrat/tune"],
     pageExtensions:
       process.env.NODE_ENV === "development" ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
   }
   ```

3. Mount the widget in your root layout, behind a `NODE_ENV` check with a dynamic import. The
   production build drops the branch, so it emits no widget chunk:

   ```tsx
   "use client"

   import dynamic from "next/dynamic"

   export const TuneMount =
     process.env.NODE_ENV === "development"
       ? dynamic(() => import("@enitrat/tune/widget").then((module) => module.TuneWidget), {
           ssr: false,
         })
       : (_: { base: string }) => null
   ```

   Render `<TuneMount base="/api/tune" />` inside `<body>`; `base` is the route's path. Press
   Alt+Shift+R to start pointing.

## Allowed origins

The bridge answers only requests whose `Host` is `localhost` or `127.0.0.1`, from an allowed
origin. By default the allowed origins are `http://localhost:3000`, `https://localhost:3000` and
the route's own origin. To allow others, such as a component catalogue on another port, list them
in `TUNE_ORIGINS`, separated by commas:

```sh
TUNE_ORIGINS=http://localhost:3000,http://localhost:6006 pnpm dev
```

## Example: a stock shadcn/ui app

```ts
import { type TuneConfigInput } from "@enitrat/tune/config"

export default {
  tokens: {
    kind: "css",
    files: ["node_modules/tailwindcss/theme.css", "app/globals.css"],
    themes: {
      shared: [],
      list: [
        { name: "light", selectors: [":root"] },
        { name: "dark", selectors: [".dark"], fallback: "light" },
      ],
    },
  },
  components: [
    {
      kind: "files",
      files: "components/ui/*.tsx",
      group: "ui",
      naming: "own",
      href: null,
      importFrom: "@/components/ui/{slug}",
      props: "cva",
    },
  ],
  plumbing: [],
  checks: {
    lint: { bin: "eslint", args: ["--fix"] },
    format: { bin: "prettier", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "root" },
  },
} satisfies TuneConfigInput
```

Check binaries run from `node_modules/.bin` at the git root, with the git root as the working
directory. For an app in a subfolder, with a component library and lab-meta files, see
`examples/next/tune.config.ts`.

## When the overlay can't answer

If a variant breaks the page that hosts the overlay, use the CLI. Add a script to your
app, which needs `tsx` installed:

```json
{ "scripts": { "tune": "tsx node_modules/@enitrat/tune/src/bin/tune.ts" } }
```

Then run `pnpm tune status`, `pnpm tune discard` or `pnpm tune gc`.
