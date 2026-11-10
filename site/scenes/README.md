# Scenes: how the playground's board is authored

The board is a small virtual repo. Every file in it has a current revision, and a recorded ask
rewrites exactly one file. Asks on different files stack: a kept total renders inside any receipt
layout, and a table style restyles both. This is how real Morph composes, because each level is
its own source file.

There are three levels:

| Level  | File                                                                            | Example ask               |
| ------ | ------------------------------------------------------------------------------- | ------------------------- |
| Part   | an object's inner component, `receipt/ReceiptTotal.tsx`                         | "Make the total the hero" |
| Object | an object's layout, the component named after its folder, `receipt/Receipt.tsx` | "Invoice"                 |
| Table  | a stylesheet of the `table` scene, `table/theme.css`                            | "Swiss"                   |

## Folder convention

```
scenes/<id>/
  scene.ts                 defineScene({ title, kind: "object" | "table" })
  <Id>.tsx                 the entry: exports function <Id>. For an object, its layout.
  <Part>.tsx               a part: exports function <Part>
  <name>.css               a stylesheet (table scene only): offered at the entry
  data.ts                  plain modules: data, live state, helpers. Never revisioned.
  asks/<slug>/ask.ts       defineAsk({ words, aliases })
  asks/<slug>/v1/<File>    what variant A wrote: exactly one file, the one the ask rewrites
  asks/<slug>/v1/meta.json direction, title, summary, ms (see VariantMeta in stage/scene.ts)
  asks/<slug>/v2/…, v3/…   the same file again, for B and C
  asks/<slug>/v1/asks/…    a refine: asks recorded on top of variant A, on the same file
```

- The repo's files are a scene folder's top-level `.tsx` and `.css` files. `.ts` files are plain
  modules.
- An ask belongs to the file its `v1/` holds. Picking any JSX in `ReceiptTotal.tsx` offers that
  file's asks. Picking the entry also offers the asks of the scene's stylesheets, so clicking the
  bare board offers the table asks.
- The plugin (`tools/scenes-plugin.ts`) derives everything else: the revision tree, each variant's
  stat against the revision its ask starts from, and the lazy chunks. It fails the build on a
  missing piece: no `scene.ts`, no entry, a `v1`..`v3` missing or holding another file, no
  `meta.json`, a variant that changes nothing, or a variant that drops a part its parent renders.

## Imports

Write imports as if the variant file sat in its scene folder:

```tsx
import { ReceiptTotal } from "./ReceiptTotal" // a repo file: always `{ Name }` from "./Name"
import { money, useTip } from "./data" // a plain module
```

The plugin resolves a variant's relative imports from its scene folder. An import of a repo file
resolves to a live binding (`stage/live.tsx`) that renders the revision of that file the board
draws, so `Receipt.tsx` v2 renders whichever `ReceiptTotal.tsx` is kept. `pnpm --filter
morph-site typecheck` regenerates `tsconfig.scenes.json` so tsc resolves imports the same way.

## The part props contract

Parts take no props. A layout places `<ReceiptItems />` and `<ReceiptTotal />` and never reaches
inside them. Every variant of a part must work inside every layout, and every layout variant must
render every part. To make that hold:

1. **State lives in `data.ts`, never in a component.** The tip and the number of people are a
   store (`useTip`, `usePeople`). A tip set on one design survives every morph, and the version
   thumbnails show the same live state.
2. **Parts draw only with the object tokens.** Colour, type and rules come from the tokens below,
   through Tailwind utilities: `bg-paper text-ink text-ink-2 border-rule bg-accent text-accent
   font-body font-display font-num`. No literal colours or font families in a part.
3. **Parts mark their anatomy with `data-role`**, so a layout or a table style can reach inside
   without knowing which variant is on the page:

| Part             | Root                  | Roles inside                                                                                                                                                                                                                                      |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReceiptItems`   | `data-part="items"`   | `line` (one item), `name`, `qty`, `price`, `group` (a course heading), `photo`                                                                                                                                                                    |
| `ReceiptTotal`   | `data-part="total"`   | `row` (subtotal, tip), `label`, `tips` (the control), `tip` (a button, `aria-pressed`), `grand` (the total), `amount` (its number), `rule`                                                                                                        |
| `PaletteSearch`  | `data-part="search"`  | `icon`, `input` (the field), `ghost` (the completion drawn under it), `key`; with filters: `scopes`, `scope` (a chip or token, `aria-pressed`), `count`, `label`                                                                                  |
| `PaletteResults` | `data-part="results"` | `section` (a group's wrapper), `group` (its heading), `row` (a command, `aria-selected`, `--slot`), `icon`, `name`, `hit` (a matched letter), `detail`, `keys`, `key`, `empty`; with recent: `recent`, `pick` (a recent command), `uses`, `meter` |
| `PaletteFooter`  | `data-part="footer"`  | `legend` (a key and its label), `key`, `label`, `status` (what ran last)                                                                                                                                                                          |

The palette's query, selection and history live in `palette/data.ts`. A row's `--slot` is the
command's fixed index, so a ring or a grid can keep each command in its place while the query
filters the others out. A ring layout lays rows out with `translate` from `--slot`; a table style
never sets a row's position. Ring layouts (`radial`, `dial`, `wheel`) hide the `recent` block and
show only the pressed scope chip. A rule that changes the field's type must also cover `ghost`,
which sits under the input letter for letter. The CRT marks its overlay `scanlines`, so a light
style can drop it.

A total that draws its `grand` as a shape says so with `data-shape`: `stamp` for a round seal,
`band` for a filled bar. Table styles restyle those through the attribute, never through the
part's classes.

A layout styles that anatomy with descendant variants on its root, for example
`[&_[data-role=label]]:uppercase` on the thermal receipt.

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
plain selectors: `[data-object="receipt"] [data-role="grand"] { … }`. No `@keyframes`, no
`@font-face`.

Each table variant must change more than colour: type, borders, density, case, alignment. Write
it per object, in the object's own block, between the markers already in every theme file:
`/* board */`, `/* placard */`, `/* receipt */`, `/* pass */`, `/* palette */`, `/* clock */`.
An object added later fills its own block in the original `theme.css` (usually empty) and in each
of the nine variants, and nothing else. Its rules must hold over every layout and part variant of
that object, so prefer roles and tokens over layout-specific selectors.

## View Transitions

`src/styles.css` names each object and part on the live board (`view-transition-name: receipt`,
`receipt-total`, …), so a part glides to where the new layout puts it. A new object adds its
names there. A name must be unique on the board, so never set one inside a scene file.

## How to add an ask

1. Create `asks/<slug>/ask.ts` with the chip words and a few aliases that free text should match.
2. Write `v1/`, `v2/`, `v3/`, each holding the full new version of the one file, plus
   `meta.json`. The three should differ in structure, layout or type, not only colour.
3. Run `pnpm --filter morph-site test`: the exhaustive test asks, flips and keeps every variant
   through the replay and parses every reply with the overlay's schemas.
4. Build and look at it composed: each part variant inside each layout, under each table style.

## How to add an object

Create `scenes/<id>/` with `scene.ts` (`kind: "object"`), its entry `<Id>.tsx`, its parts and its
`data.ts`. Render it from `table/Table.tsx` with `import { <Id> } from "../<id>/<Id>"`. Fill its
block in every theme file and add its view-transition names.
