# Visible reference measurements

- [x] Ground
- [x] Sketch
- [x] Agree. Full autonomy; no human checkpoint requested.
- [x] Implement
- [x] Scrap. Skip: behavioral checks and independent reviews support the chosen shape.

## Problem and alternatives

The inspector currently treats two page observations of original source placement as proof that the browser has restored original DOM. Neither Vite nor Next's bridge adapter acknowledges a target commit. The inspector also labels current measured DOM as a selected variant solely from file placement, and frame asks share the first target's baseline.

A rendered-revision handshake would need source and stylesheet revision evidence carried through compilation and target commitment. A generic HMR-complete event does not establish this. A per-round reference would still need honest capture labels plus candidate/current ownership through refinement. The accepted design instead makes reference measurements properties of pinned browser targets, independent of rounds. This deliberately corrects the comparison contract to describe visible snapshots, rather than preserve an unprovable original/variant claim.

Two independent design agents explored the adapter handshake and snapshot alternatives. Their agreed recommendation was per-target visible references. Synthesis retains references across replacement/reload with explicit spatial-match labeling; it does not silently clear useful historical comparison or claim recovered identity. Array slots remain stable and never compact or deduplicate. No new target-ID registry is needed.

## Caller and type sketch

Initial ask captures every subject synchronously with captureTarget(element). Each PinnedTarget has a document-space location, a nullable ReferenceMeasurement, and an explicit match of selected element, element at saved position, or missing. ReferenceMeasurement holds capture provenance (before-first-ask or saved), measured element name, viewport size, and Spec.

resolveTargets maps each target slot to a match without changing its reference or position. targetElements returns distinct connected elements only at the command/layout boundary. Refinement sends the currently resolved elements and preserves the target slots and their saved references. A retargeted reducer event updates matches only; it cannot replace reference data from an older async closure.

The inspector finds every target matching the selected DOM element and renders a comparison for each, labeled by thread/target and capture provenance. Current DOM metrics are called current element, never certified as a variant. A spatial match is labeled as an element at the saved position. Explicit Save current as reference captures only that target. The reducer checks the matching element before accepting capture. References survive rounds, polling, and retry; no round ownership state is needed.

Browser storage validates Spec and references at its boundary, preserving target slots and snapshots. Old location-only metadata imports with missing references. A missing reference offers capture, never an instruction to wait or flip to original. A viewport difference is disclosed alongside the comparison.

## Deletions and verification

Delete Pin.baseline, NewPin.baseline, measured, originalBefore, sameSpec, the automatic measurement effect, and original/variant provenance labels in the comparison. Replace repick's flatten/dedup with slot-preserving resolution.

Verify two distinct targets, multiple targets resolving to one element, disappearance/replacement, delayed DOM versus repeated source-placement polls, explicit capture, refinement/competing rounds, reload, malformed storage, and unresolved request recovery. Run the actual built widget in a browser and check computed padding differences before/after delayed placement observations. Run focused tests, full package/site suites, workspace types, formatting, production exclusion, and independent review. Full repository completion remains governed by redesign.todo.md.


The O4 inventory also identified playground readiness gated on a count of prior polls, solely to give the old measurement effect time. That gate is removed with its consumer. Recorded elapsed duration determines readiness; the first poll after readiness can select the first ready variant, and explicit show works without a prior poll. Readiness and selection remain distinct facts. Tests no longer perform redundant warm-up polls.


## Verification

The original implementation failed the real-browser scenario recorded in `/tmp/morph-baseline-repro.log`. The replacement passed nine browser assertions in `/tmp/morph-reference-browser.log`. Seven reference integration tests cover DOM delay, per-target capture, reload/spatial replacement, stale events, frame capture before lookup, old metadata and corrupted reference import, and independent thread validation. Three target-resolution tests cover replacement, disappearance and convergence without slot loss. Existing submission tests still pass. Whole-package suite passes 350 tests and playground suite passes 33. Independent reference and final storage reviewers found no correctness blocker and ran 18/19 focused tests respectively. The source revision handshake remains deliberately outside the product contract; comparisons describe actual visible snapshots.
