# Overlay UI stack spike

Tailwind v4, `motion` 14 and Detent's `MorphingDock` inside Tune's shadow root. Measured with Playwright in Chromium and WebKit against the Next example, with the host's own `@property` rules stripped to stand in for a page without Tailwind v4.

## Works as is

- Tailwind v4 compiled at build time by `scripts/ui-css.mjs` (theme + utilities, no preflight, px theme) and inlined through esbuild `define`. The examples consume `dist`, so the dev path is the package build. Vitest defines empty strings.
- `motion`: the dock's width spring (156px to 320px over about 30 distinct frames), the `layoutId` plate sliding between buttons, and `MotionConfig reducedMotion="user"`. Under reduced motion the hover label's transform stays `none` and the width jumps in one frame.
- `layoutId` and `getBoundingClientRect` behave normally in the shadow root. `motion` is bundled into `widget.js`, so it never shares an instance or layout ids with the app's copy.

## Needed a fix

- `@property` is ignored in shadow trees. On a host without Tailwind v4 the dock's `shadow-[...]` computed to `box-shadow: none` in both engines. It only worked on the Next example because the host registers the same `--tw-*` properties. Fix: `forShadowRoot()` removes the `@supports` gate around Tailwind's own `--tw-*` initials on `*` and drops the inert `@property` rules. The build fails if that block changes shape.
- `@font-face` in a shadow stylesheet never loads in Chromium (probe text width equalled the monospace fallback). Fix: Geist and Geist Mono variable fonts are inlined as data URLs and added to `document.fonts` as `Tune Geist` and `Tune Geist Mono` (`fonts.ts`, called from `mountTune`).
- Without preflight, UA button styles showed (grey circles, borders). Fix: a reset scoped to `.ui` in `@layer base`.
- The legacy unlayered `kbd {}` rule beat the utilities. Fix: the legacy CSS is wrapped in `@layer legacy`, ordered lowest. The legacy panel screenshot is byte-identical before and after.
- Window listeners see the `tune-root` host as `e.target` (measured). Fix in `MorphingDock`: outside click and the shortcut guard read `composedPath()`. The plate's `layoutId` is prefixed.
- Portals: the dock, `Kbd` and `lib/motion` have none, so nothing was ported. `Layer`, `CommandMenu` and `PromptBox` still need a shadow-root portal host.

## Bundle size, `dist/widget.js` (unminified, as shipped)

232,935 B before, 809,062 B after (+576 KB, 291 KB gzip). About 389 KB is `motion` plus the dock (143 KB of it when minified). About 187 KB is the two base64 fonts. CSS is about 7 KB.

## Open risks

- Only `src/overlay/ui` is scanned. Scanning the whole overlay generates `.flex`, `.border`, `.shadow` and other utilities from legacy class names and comments. Widen the scan only when the legacy CSS goes.
- `*` initials are not registered properties, so `--tw-*` values cannot be transitioned. That does not matter for motion-driven animation.
- The dock's single-letter shortcuts (i, m, n) listen on `window` and fire on the host page outside inputs. The rebuild needs a modifier or focus scoping.
- Fonts add 187 KB to a dev-only bundle. Serving them through the bridge instead would remove that.
- Firefox was not tested because no Playwright Firefox build is installed.
- Detent's unlisted components (the dock among them) still need the licence confirmation that PRIMITIVES.md mentions.
