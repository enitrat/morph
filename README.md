# Morph

Morph is a development-only overlay for a React app. Point at an element and describe a change.
Morph asks the `claude` CLI for a few variants, builds each one in its own git worktree, and lets
you flip between them on the live page. You can then fine-tune the result: step a design token,
a Tailwind utility or a component prop. Keep the variant you like and discard the rest.

Morph writes only to your working tree, and only while the dev server runs.

## Requirements

- React 19 in development, on Next.js with the App Router or on Vite. On Next, Server Components
  and client components both work.
- Node.js ^22.18.0 or >=24.11.0.
- A git checkout. Variants are built in worktrees and kept as refs.
- Design tokens as CSS custom properties, Tailwind CSS 4 style (`@theme`, `:root`, `.dark`).
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), signed in, on your `PATH`.

## Try it

This repo holds the package and two example apps that render the same page:

- `packages/morph` is the package, `@enitrat/morph`.
- `examples/shared` contains the landing page and shared components from the shadcn/ui registry.
- `examples/next` is a Next app with a Server Component page.
- `examples/vite` is a Vite single-page app.

```sh
pnpm install
pnpm dev        # Next, http://localhost:3000
pnpm dev:vite   # Vite, http://localhost:5173
```

The shared button, badge and card are copied from the [shadcn/ui registry](https://ui.shadcn.com/docs/components); their source is in `examples/shared/ui`. Both apps configure Morph to discover these components and the shared Tailwind tokens.

Open the page and press Alt+Shift+R. Choose **Inspect** to measure the running page. Drag a
frame to reveal element dimensions, padding, spacing and corner radii inside it; release to
fade the temporary blueprint. Click an element to pin its measurements and use the existing
fine-tune controls in the panel. Inspection reads the rendered page without changing source.
Press Escape or choose another tool to leave inspection mode.

`pnpm check:prod` builds both examples for production and
fails if any output file names Morph.

## Install

```sh
pnpm add -D "github:enitrat/morph#path:/packages/morph"
```

## Set it up

Describe your design system in `morph.config.ts` at your app's root, the folder that runs the dev
server. Paths are relative to that app directory, including token files, component globs, tier
rules and plumbing prefixes. Paths may reach shared files in the same Git checkout with `..`.
Existing Git-root-relative configurations can retain their meaning by setting `pathBase: "repo"`.
The schema is `MorphConfigInput`:

```ts
import { type MorphConfigInput } from "@enitrat/morph/config"

export default {/* … */} satisfies MorphConfigInput
```

Then follow the steps for your bundler.

### Next.js

Run `pnpm exec morph setup-next` to create the route and client mount shown below. The command
leaves existing files alone and prints the remaining layout and configuration steps. You can also
create the files manually. After completing the layout and configuration steps, run `pnpm exec morph
doctor` from the app root. It checks the config, local tools, Git checkout, Claude executable, and
recognizable Next wiring. It reads source text, so passing does not prove that the bridge is running
or that a production build excludes it. Start the app to check the bridge, then build your app and
inspect its output for Morph. The repository-only `pnpm check:prod` checks the example builds.
Doctor loads the config as code; use it only with a trusted config.

1. Add the bridge route at `app/api/morph/[op]/route.dev.ts`:

   ```ts
   import { morphRoute } from "@enitrat/morph/next"

   import config from "../../../../morph.config"

   export const { GET, POST, OPTIONS } = morphRoute(config)
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

   export const MorphMount =
     process.env.NODE_ENV === "development"
       ? dynamic(
           () =>
             import("@enitrat/morph/widget").then(({ MorphWidget }) => () => (
               <MorphWidget base="/api/morph" />
             )),
           { ssr: false },
         )
       : () => null
   ```

   Render `<MorphMount />` inside `<body>`. `base` is the bridge route's path.

### Vite

Add the plugin to `vite.config.ts`:

```ts
import { morph } from "@enitrat/morph/vite"
import { defineConfig } from "vite"

import morphConfig from "./morph.config.ts"

export default defineConfig({
  plugins: [/* react(), tailwindcss(), … */ morph(morphConfig)],
})
```

`pnpm exec morph doctor` checks common prerequisites for Vite apps but does not inspect Vite wiring.
It loads the config as code; use it only with a trusted config. Start the app to check the bridge,
then build your app and inspect its output for Morph.

The plugin runs under `vite` only, never under `vite build`. It serves the bridge at `/__morph` and
adds the widget to `index.html`, so a single-page app needs no other change.

A framework that renders its own HTML on Vite has no `index.html` for the plugin to change. Pass
`{ inject: false }` as the plugin's second argument and render the widget yourself, behind
`import.meta.env.DEV`:

```tsx
import { lazy } from "react"

export const MorphMount = import.meta.env.DEV
  ? lazy(() =>
      import("@enitrat/morph/widget").then(({ MorphWidget }) => ({
        default: () => <MorphWidget base="/__morph" />,
      })),
    )
  : () => null
```

Render `<MorphMount />` on the client. To serve the bridge elsewhere, pass the same `base` to the
plugin and the widget.

## Allowed origins

The bridge answers only requests whose `Host` is `localhost` or `127.0.0.1`, from an allowed
origin. By default the allowed origins are `http://localhost:3000`, `https://localhost:3000` and
the bridge's own origin. To allow others, such as a component catalogue on another port, list them
in `MORPH_ORIGINS`, separated by commas:

```sh
MORPH_ORIGINS=http://localhost:3000,http://localhost:6006 pnpm dev
```

## Example: a stock shadcn/ui app

```ts
import { type MorphConfigInput } from "@enitrat/morph/config"

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
} satisfies MorphConfigInput
```

Formatting and linting run in the app directory. Morph looks for their binaries in the app’s
`node_modules/.bin`, then the Git root’s. Typechecks run in each affected workspace with
`scope: "workspace"`, in the app with `scope: "app"`, or at the Git root with `scope: "root"`.
For each typecheck Morph looks in that workspace first, then the app and Git root. Worktree jobs
use the corresponding directories inside the worktree. See `examples/next/morph.config.ts` for
Git-root-relative shared sources.

Component sources default to group `ui`, naming `own`, and no catalogue link. File sources
default to CVA props; lab-meta sources default to lab metadata. Set `props` to `"none"` when
there are no editable props. `importFrom` and theme ownership remain explicit.

The default agent styling rule uses existing Tailwind utilities and design tokens. To use a
different project convention, set `styleRules` to an array of instructions in `morph.config.ts`.
For example, `styleRules: ["Use the existing CSS modules and design tokens."]` replaces the
default. An empty array removes the default styling rule.

## When the overlay can't answer

If a variant breaks the page that hosts the overlay, run `pnpm exec morph status`,
`pnpm exec morph discard` or `pnpm exec morph gc` from your app.
