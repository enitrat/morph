# Scenes: how the playground's board is authored

The board is a small virtual repo. Every file in it has a current revision, and a recorded ask
rewrites exactly one file. Asks on different files stack: a kept route renders inside any pass
layout, and a table style restyles both. This is how real Morph composes, because each level is
its own source file.

There are three levels:

| Level  | File                                                                      | Example ask            |
| ------ | ------------------------------------------------------------------------- | ---------------------- |
| Part   | an object's inner component, `pass/PassRoute.tsx`                         | "Draw the flight path" |
| Object | an object's layout, the component named after its folder, `pass/Pass.tsx` | "Departure board"      |
| Table  | a stylesheet of the `table` scene, `table/theme.css`                      | "Swiss"                |

## Folder convention

```
scenes/<id>/
  scene.ts                 defineScene({ title, kind, files }): files names each repo file for visitors
  <Id>.tsx                 the entry: exports function <Id>. For an object, its layout.
  <Part>.tsx               a part: exports function <Part>
  <name>.css               a stylesheet (table scene only): offered at the entry
  data.ts                  plain modules: data, live state, helpers. Never revisioned. Exports reset().
  asks/<slug>/ask.ts       defineAsk({ words, aliases })
  asks/<slug>/v1/<File>    what variant A wrote: exactly one file, the one the ask rewrites
  asks/<slug>/v1/meta.json direction, title, summary, ms (see VariantMeta in stage/scene.ts)
  asks/<slug>/v2/…, v3/…   the same file again, for B and C
  asks/<slug>/v1/asks/…    a refine: asks recorded on top of variant A, on the same file
```

- The repo's files are a scene folder's top-level `.tsx` and `.css` files. `.ts` files are plain
  modules.
- An ask belongs to the file its `v1/` holds. Picking any JSX in `PassRoute.tsx` offers that
  file's asks. Picking the entry also offers the asks of the scene's stylesheets, so clicking the
  bare board offers the table asks.
- The plugin (`tools/scenes-plugin.ts`) derives everything else: the revision tree, each variant's
  stat against the revision its ask starts from, and the lazy chunks. It fails the build on a
  missing piece: no `scene.ts`, no entry, a `v1`..`v3` missing or holding another file, no
  `meta.json`, a variant that changes nothing, or a variant that drops a part its parent renders.

## Imports

Write imports as if the variant file sat in its scene folder:

```tsx
import { PassRoute } from "./PassRoute" // a repo file: always `{ Name }` from "./Name"
import { money, useTip } from "./data" // a plain module
```

The plugin resolves a variant's relative imports from its scene folder. An import of a repo file
resolves to a live binding (`stage/live.tsx`) that renders the revision of that file the board
draws, so `Pass.tsx` v2 renders whichever `PassRoute.tsx` is kept. `pnpm --filter
morph-site typecheck` writes one tsconfig per scene into `.tsconfigs/`, with that scene's variant
folders as `rootDirs`, so tsc resolves imports the same way and two scenes' `./data` stay apart.

## The part props contract

Parts take no props. A layout places `<PassRoute />` and `<PassSeat />` and never reaches
inside them. Every variant of a part must work inside every layout, and every layout variant must
render every part. To make that hold:

1. **State lives in `data.ts`, never in a component, and `data.ts` exports `reset()`**, which the
   page's Reset calls for every scene. The pass's seat is a store (`useSeat`). A seat chosen
   on one design survives every morph, and the version
   thumbnails show the same live state.
2. **Parts draw only with the object tokens.** Colour, type and rules come from the tokens below,
   through Tailwind utilities: `bg-paper text-ink text-ink-2 border-rule bg-accent text-accent
   font-body font-display font-num`. No literal colours or font families in a part.
3. **Parts mark their anatomy with `data-role`**, so a layout or a table style can reach inside
   without knowing which variant is on the page:

| Part             | Root                   | Roles inside                                                                                                                                                                                                         |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerCover`    | `data-part="cover"`    | `art` (the sleeve, an SVG that fills whatever box the layout gives it, round or square)                                                                                                                              |
| `PlayerProgress` | `data-part="progress"` | `track` (the seekable element, `role="slider"`), `fill` (the played portion, or each played bar of a waveform), `head` (the playhead), `time` (elapsed), `remain` (time left or the length), `lyric` (the sung line) |
| `PlayerControls` | `data-part="controls"` | `play` (play and pause, `aria-pressed`), `key` (restart, skip), `toggle` (like, loop, `aria-pressed`)                                                                                                                |

The player's parts size to their box and never set their own height budget: a layout gives the
cover its box and leaves at least 56 px for the progress and 60 px for the controls. Its playback,
like and loop live in `player/data.ts`, so the song keeps playing through every morph. Hardware a
layout draws around a part (an LCD, a speaker rail) sets the ink tokens locally, so a table style
recolours the shell and the screen keeps its own ink.

The boarding pass (`pass/`) keeps its seat in `useSeat` and its gate countdown in `useGate`:

| Part        | Root                | Roles inside                                                                                                                                                |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PassRoute` | `data-part="route"` | `from`, `to` (an end), `code` (the airport code), `city`, `time`, `path` (the line or map between), `plane`, `duration`                                     |
| `PassSeat`  | `data-part="seat"`  | `field` (with `data-field`: `boarding`, `gate`, `seat`, `group`), `label`, `value`, `seats` (the control), `seat-option` (a button, `aria-pressed`), `kind` |
| `PassStub`  | `data-part="stub"`  | `countdown` (the gate line), `label`, `status` (Boarding or Final call), `clock` (its digits), `barcode`, `meta`                                            |

Its layouts add `field`, `label` and `value` for the passenger, flight and date, `tear` and
`notch` for a perforation, and `flap` for one split-flap tile. A layout may hide the route's
`code` when it sets the codes itself, so a table style never sets `display` on a part's roles.

A layout styles that anatomy with descendant variants on its root, for example
`[&_[data-role=label]]:uppercase`.

## Object tokens

Every object's layout sets the tokens on its root with arbitrary properties
(`[--color-paper:#f6f4ee]`). Parts read them. A table style sets them again.

| Token                                         | Use                                 |
| --------------------------------------------- | ----------------------------------- |
| `--color-paper`                               | the object's surface                |
| `--color-ink`, `--color-ink-2`                | text, muted text                    |
| `--color-rule`                                | separators, borders                 |
| `--color-accent`, `--color-on-accent`         | the one emphasis colour, text on it |
| `--font-body`, `--font-display`, `--font-num` | running text, headings, amounts     |

Font families to set them to: `--font-sans` (Inter Tight), `--font-thermal` (Space Mono),
`--font-grotesk` (Archivo), `--font-editorial` (Fraunces), `--font-serif` (Instrument Serif).

## Table-style hooks

Every object marks:

- its root: `data-object="<id>"`, plus `data-layout="<name>"` naming the layout variant;
- its surface: `data-role="paper"`, the element with the background, padding and radius;
- shared roles: `heading`, `meta` (small print), `rule`, `barcode`.

The board root is `data-board`, with `--color-board`, `--color-board-edge` and `--color-dot`.

A table variant (`table/asks/<slug>/vN/theme.css`) is the whole stylesheet. The page nests it
inside `[data-repo="…"] { … }`, so it applies to that board only and a version's thumbnail keeps
its own style. It is unlayered, so it wins over every Tailwind utility without `!important`. Write
plain selectors: `[data-object="pass"] [data-role="code"] { … }`. No `@keyframes`, no
`@font-face`.

Each table variant must change more than colour: type, borders, density, case, alignment. Write
it per object, in the object's own block, between the markers already in every theme file:
`/* board */`, `/* pass */`, `/* player */`.
An object added later fills its own block in the original `theme.css` (usually empty) and in each
of the nine variants, and nothing else. Its rules must hold over every layout and part variant of
that object, so prefer roles and tokens over layout-specific selectors.

## View Transitions

The page names each object and part on the live board from its `data-object` and `data-part`
before every morph, so a part glides to where the new layout puts it. Never set a
`view-transition-name` inside a scene file.

## How to add an ask

1. Create `asks/<slug>/ask.ts` with the chip words and a few aliases that free text should match.
2. Write `v1/`, `v2/`, `v3/`, each holding the full new version of the one file, plus
   `meta.json`. The three should differ in structure, layout or type, not only colour.
3. Run `pnpm --filter morph-site test`: the exhaustive test asks, flips and keeps every variant
   through the replay and parses every reply with the overlay's schemas.
4. Build and look at it composed: each part variant inside each layout, under each table style.

## How to add an object

Create `scenes/<id>/` with `scene.ts` (`kind: "object"`), its entry `<Id>.tsx`, its parts and its
`data.ts` (with `reset()`). Name every repo file in `scene.ts` `files`; the build fails on a file
with no name. Render it from `table/Table.tsx` with `import { <Id> } from "../<id>/<Id>"`, and fill
its block in every theme file. Morph names come from `data-object` and `data-part`, so a new
object morphs part by part with no stylesheet entry.
