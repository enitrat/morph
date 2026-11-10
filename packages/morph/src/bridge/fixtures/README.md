Copies of third-party sources that Morph's tests build a design-system model from.

- `shadcn-dash/` trims [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter)
  at `47da494`: its `src/styles` (`globals.css` keeps the imports, variants, base layer and the
  shimmer keyframes) and `src/components/ui/{button,badge}.tsx`, unchanged.
- `tailwindcss-theme.css` is `tailwindcss@4.3.3`'s `theme.css`, unchanged. The test serves it at
  `node_modules/tailwindcss/theme.css`, where a real app reads it.

Both are MIT-licensed by their authors.

`acme/` is synthetic, written for these tests: a `packages/ui` design system with lab-meta
components, used by an `apps/site` app. Its `morph.config.ts` is a worked config for that layout.
