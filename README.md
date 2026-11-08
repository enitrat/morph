# Tune

Tune is a development-only overlay for a React app. Point at an element and describe a change.
Tune asks the `claude` CLI for a few variants, builds each one in its own git worktree, and lets
you flip between them on the live page. You can then fine-tune the result: step a design token,
a Tailwind utility or a component prop. Keep the variant you like and discard the rest.

Tune writes only to your working tree, and only while the dev server runs.

## Requirements

- React 19 in development, on Next.js with the App Router or on Vite. On Next, Server Components
  and client components both work.
- Node.js ^22.18.0 or >=24.11.0.
- A git checkout. Variants are built in worktrees and kept as refs.
- Design tokens as CSS custom properties, Tailwind CSS 4 style (`@theme`, `:root`, `.dark`).
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), signed in, on your `PATH`.

## Try it

This repo holds the package and two example apps that render the same page:

- `packages/tune` is the package, `@enitrat/tune`.
- `examples/shared` contains the landing page and shared components from the shadcn/ui registry.
- `examples/next` is a Next app with a Server Component page.
- `examples/vite` is a Vite single-page app.

```sh
pnpm install
pnpm dev        # Next, http://localhost:3000
pnpm dev:vite   # Vite, http://localhost:5173
```

The shared button, badge and card are copied from the [shadcn/ui registry](https://ui.shadcn.com/docs/components); their source is in `examples/shared/ui`. Both apps configure Tune to discover these components and the shared Tailwind tokens.

Open the page and press Alt+Shift+R. `pnpm check:prod` builds both examples for production and
fails if any output file names Tune.

## Install

```sh
pnpm add -D "github:enitrat/tune#path:/packages/tune"
```

## Set it up

Describe your design system in `tune.config.ts` at your app's root, the folder that runs the dev
server. Paths are relative to that app directory, including token files, component globs, tier
rules and plumbing prefixes. Paths may reach shared files in the same Git checkout with `..`.
Existing Git-root-relative configurations can retain their meaning by setting `pathBase: "repo"`.
The schema is `TuneConfigInput`:

```ts
import { type TuneConfigInput } from "@enitrat/tune/config"

export default {/* … */} satisfies TuneConfigInput
```

Then follow the steps for your bundler.

### Next.js

Run `pnpm exec tune setup-next` to create the route and client mount shown below. The command
leaves existing files alone and prints the remaining layout and configuration steps. You can also
create the files manually. After completing the layout and configuration steps, run `pnpm exec tune
doctor` from the app root. It checks the config, local tools, Git checkout, Claude executable, and
recognizable Next wiring. It reads source text, so passing does not prove that the bridge is running
or that a production build excludes it. Start the app to check the bridge, then build your app and
inspect its output for Tune. The repository-only `pnpm check:prod` checks the example builds.
Doctor loads the config as code; use it only with a trusted config.

1. Add the bridge route at `app/api/tune/[op]/route.dev.ts`:

   ```ts
   import { tuneRoute } from "@enitrat/tune/next"

   import config from "../../../../tune.config"

   export const { GET, POST, OPTIONS } = tuneRoute(config)
   ```

   Let Next serve `.dev.ts` routes only under `next dev`, so no production build contains the
   bridge. In `next.config.mjs`, merge this with any existing page extensions:

   ```js
   const dev = process.env.NODE_ENV === "development"

   export default {
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

`pnpm exec tune doctor` checks common prerequisites for Vite apps but does not inspect Vite wiring.
It loads the config as code; use it only with a trusted config. Start the app to check the bridge,
then build your app and inspect its output for Tune.

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
      importFrom: "@/components/ui/{slug}",
    },
  ],
  checks: {
    lint: { bin: "eslint", args: ["--fix"] },
    format: { bin: "prettier", args: ["--write"] },
    typecheck: { bin: "tsc", args: ["--noEmit"], scope: "app" },
  },
} satisfies TuneConfigInput
```

Formatting and linting run in the app directory. Tune looks for their binaries in the app’s
`node_modules/.bin`, then the Git root’s. Typechecks run in each affected workspace with
`scope: "workspace"`, in the app with `scope: "app"`, or at the Git root with `scope: "root"`.
For each typecheck Tune looks in that workspace first, then the app and Git root. Worktree jobs
use the corresponding directories inside the worktree. See `examples/next/tune.config.ts` for
Git-root-relative shared sources.

Component sources default to group `ui`, naming `own`, and no catalogue link. File sources
default to CVA props; lab-meta sources default to lab metadata. Set `props` to `"none"` when
there are no editable props. `importFrom` and theme ownership remain explicit.

The default agent styling rule uses existing Tailwind utilities and design tokens. To use a
different project convention, set `styleRules` to an array of instructions in `tune.config.ts`.
For example, `styleRules: ["Use the existing CSS modules and design tokens."]` replaces the
default. An empty array removes the default styling rule.

## When the overlay can't answer

If a variant breaks the page that hosts the overlay, run `pnpm exec tune status`,
`pnpm exec tune discard` or `pnpm exec tune gc` from your app.
