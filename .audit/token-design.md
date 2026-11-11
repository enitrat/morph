# Shared CSS source and prospective token edits

- [x] Ground
- [x] Sketch
- [x] Agree. Full autonomy; no human checkpoint requested.
- [x] Implement
- [x] Verify and independently review

B4 and B5 jointly own this unit. Two read-only design passes confirmed that the source reader strips syntax that the writer searches again differently, and that depth24 is not cycle detection. Direct reproductions established long acyclic chains failing, accepted indirect/batch cycles, change-then-restore batches failing, malformed var() accepted, quoted var text counted, and nested fallback not resolved.

Use direct PostCSS and postcss-value-parser dependencies, hidden behind application-owned TokenSource, TokenBlock, SourceDeclaration and SourceSpan records. Read graph declarations and rewrite exact winning spans from those records. Traverse transparent layer containers; exclude conditional rules, reference themes and keyframes while retaining direct declarations beside nested keyframes. Preserve source/declaration order and Tailwind default/reset behavior. Source offsets account for BOM, CRLF, comments, !important and semicolonless declarations. Insertions add a required terminator without discarding original formatting.

A shared value parser owns dependencies, exact aliases, syntax checks and variable substitution. Per-theme evaluation selects actual declarations and drives explicit replacement frames. A frame requests only the dependencies its expression reads; fallback branches execute only when needed. Encountering an active replacement marks that cycle's members invalid. Values are resolved, unresolved outside this catalog, or invalid with a diagnostic. Unsupported source syntax and unresolved caller fallbacks stay browser expressions. CSS token boundaries survive substitution, so var(--number)px cannot become a length. Alias chains return no terminal primitive for invalid cycles. Expansion has an explicit one-million-character resource bound rather than conflating recursion depth with cycles.

The first SCC design followed the published 2022 CSS Variables document, including unused fallback edges. An actual Chrome156 comparison disproved that behavior. The October2026 Editor Draft specifies lazy replacement contexts. The implementation now follows the current draft and rendered behavior; the eager SCC code was deleted. Source dependency discovery still includes fallbacks for impact analysis and edit tier policy. Cycle evaluation only follows active replacements.

Nested @theme utility declarations directly inside configured selectors remain globally classified for compatibility with the existing utility catalog. Source declarations sort by original offsets so those blocks do not reorder first-declaration precedence. Conditional and arbitrary nested selectors remain excluded.

prepareTokenEdits is the one ordered preparation operation. It checks policy, plans exact replacements and theme-inheritance pins, patches source, rebuilds the graph, and validates changed token values before the next edit. No-op edits succeed. The whole batch returns files only on success. editError projects this same operation for dial choices. The bridge no longer repeats scope validation, no-op checks and editError before applying. The separate writer and synthetic withChange graph are deleted.

The source loader's existing malformed-input exception boundary remains separate B8 work; released edits return invalid decisions as values. Existing graph policy still supports ASCII token names and preserves expressions outside its catalog rather than claiming to implement the entire browser cascade.

Primary documentation consulted: [PostCSS API](https://postcss.org/api/), [value parser](https://github.com/postcss/postcss-value-parser), and [current CSS Variables replacement rules](https://drafts.csswg.org/css-variables/). Rendered comparisons passed twelve checks for active cycles, unused fallback branches, external dependencies, keyword handling, source edits and inherited-theme pins. The built widget passed nine reference-measurement checks. The package suite passes 375 tests across 56 files; the site suite passes 33 tests. Workspace types pass. Next and Vite production builds contain zero Morph strings. An independent browser differential compared 3,000 rendered color values across 500 deterministic six-token graphs, with zero mismatches after correcting early cycle unwinding. Final independent review approved evaluator behavior, source ordering and exact edits.


Final ownership is core/token-source.ts for classified original source and exact spans, core/css-value.ts for expression parsing, core/token-values.ts for lazy theme evaluation, and core/edit.ts for complete prospective edit decisions. core/write.ts and its duplicate parser/synthetic graph updates are deleted. Expected edit refusals remain values. Malformed source loading and the broad handler exception boundary remain separately tracked under B8.

Verification logs are /tmp/morph-css-tests3.log, /tmp/morph-css-site-tests.log, /tmp/morph-css-types3.log, /tmp/morph-css-browser3.log, /tmp/morph-css-widget-browser.log and /tmp/morph-css-prod-final.log. Reproduce the browser comparisons with .audit/token-browser.js against the local site server. All work remains uncommitted.
