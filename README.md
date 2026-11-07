# Tune

Tune is a development-only overlay for a React app. Point at an element and describe a change.
Tune asks the `claude` CLI for a few variants, builds each one in its own git worktree, and lets
you flip between them on the live page. You can then fine-tune the result: step a design token,
a Tailwind utility or a component prop. Keep the variant you like and discard the rest.

Tune writes only to your working tree, and only while the dev server runs.

## Requirements

- React 19 in development, on Next.js with the App Router or on Vite. On Next, Server Components
  and client components both work.
- A git checkout. Variants are built in worktrees and kept as refs.
- Design tokens as CSS custom properties, Tailwind CSS 4 style (`@theme`, `:root`, `.dark`).
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), signed in, on your `PATH`.

## Try it

This repo holds the package and two example apps that render the same page:

- `packages/tune` is the package, `@enitrat/tune`.
- `examples/acme` is a small design system: tokens, components and their lab-meta files.
- `examples/next` is a Next app on it, with a Server Component page.
- `examples/vite` is a Vite single-page app on it.

```sh
pnpm install
pnpm dev        # Next, http://localhost:3000
pnpm dev:vite   # Vite, http://localhost:5173
```

Open the page and press Alt+Shift+R. `pnpm check:prod` builds both examples for production and
fails if any output file names Tune.

## Install

```sh
pnpm add -D "github:enitrat/tune#path:/packages/tune"
```

## Set it up

Describe your design system in `tune.config.ts` at your app's root, the folder that runs the dev
server. Every path in it is relative to the git root, which differs from the app's root when the
app sits in a monorepo. See the example below. The schema is `TuneConfigInput`:

```ts
import { type TuneConfigInput } from "@enitrat/tune/config"

export default { /* … */ } satisfies TuneConfigInput
```

Then follow the steps for your bundler.

### Next.js

1. Add the bridge route at `app/api/tune/[op]/route.dev.ts`:

   ```ts
   import { tuneRoute } from "@enitrat/tune/next"

   import config from "../../../../tune.config"

   export const { GET, POST, OPTIONS } = tuneRoute(config)
   ```

   Then let Next compile Tune and serve `.dev.ts` routes, both only under `next dev`, so no
   production build contains the bridge. In `next.config.mjs`:

   ```js
   const dev = process.env.NODE_ENV === "development"

   export default {
     transpilePackages: dev ? ["@enitrat/tune"] : [],
     pageExtensions: dev ? ["dev.ts", "tsx", "ts", "jsx", "js"] : undefined,
   }
   ```

2. Mount the widget in your root layout, behind a `NODE_ENV` check with a dynamic import. The
   production build drops the branch, so it emits no widget chunk:

   ```tsx
   "use client"

   import dynamic from "next/dynamic"

   export const TuneMount =
     process.env.NODE_ENV === "development"
       ? dynamic(
           () =>
             import("@enitrat/tune/widget").then(({ TuneWidget }) => () => (
               <TuneWidget base="/api/tune" />
             )),
           { ssr: false },
         )
       : () => null
   ```

   Render `<TuneMount />` inside `<body>`. `base` is the bridge route's path.

### Vite

Add the plugin to `vite.config.ts`:

```ts
import { tune } from "@enitrat/tune/vite"
import { defineConfig } from "vite"

import tuneConfig from "./tune.config.ts"

export default defineConfig({
  plugins: [/* react(), tailwindcss(), … */ tune(tuneConfig)],
})
```

The plugin runs under `vite` only, never under `vite build`. It serves the bridge at `/__tune` and
adds the widget to `index.html`, so a single-page app needs no other change.

A framework that renders its own HTML on Vite has no `index.html` for the plugin to change. Pass
`{ inject: false }` as the plugin's second argument and render the widget yourself, behind
`import.meta.env.DEV`:

```tsx
import { lazy } from "react"

export const TuneMount = import.meta.env.DEV
  ? lazy(() =>
      import("@enitrat/tune/widget").then(({ TuneWidget }) => ({
        default: () => <TuneWidget base="/__tune" />,
      })),
    )
  : () => null
```

Render `<TuneMount />` on the client. To serve the bridge elsewhere, pass the same `base` to the
plugin and the widget.

## Allowed origins

The bridge answers only requests whose `Host` is `localhost` or `127.0.0.1`, from an allowed
origin. By default the allowed origins are `http://localhost:3000`, `https://localhost:3000` and
the bridge's own origin. To allow others, such as a component catalogue on another port, list them
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
