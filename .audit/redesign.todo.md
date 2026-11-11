# Morph redesign

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [ ] Phase C: Run the loop
- [ ] Phase D: Keep the audit trail
- [ ] Phase E: Verify and hand back

## Completion contract

Audit all first-party runtime code, build adapters, examples, and tests for compensating code and implicit lifecycle state. Record each finding with its owning module, required behavior, first-principles alternative, and disposition. Rewrite accepted findings in cohesive steps under refactor-readability and coding-standards. Preserve product behavior unless a defect is explicitly recorded and verified separately. Completion requires the full inventory resolved, meaningful behavior checks, typechecks, production exclusion checks, and review of the actual diff.

## Workflow

1. Establish architecture and baseline tests. Read-only explorers cover bridge/core/variant, overlay/inspector/dial/widget, and playground/examples/build adapters.
2. Rank findings by lifecycle risk. Distinguish necessary external-boundary recovery from avoidable internal compensation.
3. For each cohesive unit, record alternatives and choose the data model before editing. Verify existing behavior first, migrate all callers, remove the old representation, and run relevant checks before continuing.
4. Independently review each implemented unit. Keep unresolved defects and untouched findings explicit.
5. Verify the complete repository against the completion contract.

## Current units

- [x] Start package baseline through the real build and test commands.
- [x] Consolidate all three audit reports into redesign.md.
- [x] Replace playground history with the current kept repository and derive ledger entries from revision provenance.
- [x] Replace implicit player transport with paused/playing state; verify fixed-origin clock at 60 Hz and across design replacement.
- [x] Implement ordered page observations, one locked page capture, and independent command acknowledgement; verify stale response interleavings.
- [x] Record the durable checkpoint design and its crash/migration completion contract.
- [x] Atomically publish preparing/active/closing/closed rounds with tree intent; verify interruption, repost, refusal, and migration behavior.
- [x] Replace variant PID/phase/result files with owned checkpoint attempts; verify cross-process claims, cancellation, stale publication, startup failure, and unrelated recovery.
- [x] Own command cancellation and await termination before slot release; verify resistant children and uninterrupted Git transactions.
- [x] Replace request-bound planning with durable planner attempts and visible planning/failure views across all consumers.
- [x] Redesign overlay command/poll ordering and pending/refining lifecycle.
- [x] Replace poll-count DOM baseline inference with explicit measurement provenance and remove playground readiness warm-up.
- [x] Unify CSS source parsing and token edits; replace depth limits with lazy replacement ownership.
- [ ] Resolve remaining inventory findings in ranked groups.
- [ ] Full completion audit.

The first sampled-position player design failed the expanded 60 Hz check and was replaced with a fixed origin plus observation time. S6's sound scheduling remains open. Ordered observations and stable thread/request ownership address B1/O1/O2 lifecycle findings. The atomic checkpoint now owns round closure and refinement intent. Variant execution now has fenced ownership and explicit startup outcomes. Command cancellation now owns process groups and waits before slot release. Detached planner ownership and planning/failure views are now implemented. Overlay commands and presentation now use stable threads and exact unresolved requests, replacing optimistic ID reversal and ambiguous-response compensation. Per-target saved references now remove the unsupported inference that a full poll proves HMR has restored original DOM. Core graph/CSS findings B4/B5 now have shared exact source records, prospective ordered edits and browser-verified lazy cycle evaluation. Next address B6/B7/B8 and the remaining overlay lifecycle inventory.

## Throughput checkpoint

Three read-only explorers own distinct areas; the primary agent owns edits. Existing transport, git-fixture, and exhaustive recorded-scene tests supply behavior evidence. No concurrent writers or new generic state-machine framework. The first step removes unused history while the riskier lifecycle redesigns are grounded. No deployment or PR is required for the requested local redesign.

## Paused checkpoint

The user requested stopping, committing and pushing after B4/B5 verification. The full redesign goal is paused, not complete. B7 was grounded and reproduced but has no implementation in this checkpoint. Its unfinished tests were removed; .audit/cache-design.md records the next candidate. Resume against the remaining inventory rather than treating this commit as full-goal completion.
