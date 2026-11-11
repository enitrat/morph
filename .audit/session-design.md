# Durable sessions and ordered observations

Status: ordered observations, atomic round/tree checkpoints, owned variant execution, command cancellation, and detached durable planning are implemented. Planning/failure/active views now reach the overlay, CLI, headless tooling, and replay consumers. Stable pin identity and the remaining broader inventory are still open. This unit does not establish completion of B1, B2, B3, O1, or O2 as a whole.

## Problem

The original bridge reconstructed one session from an in-memory cancellation map, `session.json`, optional `parent.json`, git refs, and independently published job files. The checkpoint replaces session, parent, PID, phase, and result files as runtime authorities. The process-local planner map and long per-session locks are removed. The browser compensates with pending pin flags, remembered pin IDs, optimistic refinement ID replacement, and rollback.

These are not independent problems. A failed planner can follow a successful keep that deleted the old session. A crash can happen between the keep's file writes and publication of the next round. The UI cannot infer the outcome from a failed HTTP request or from missing files.

## Decisions

Retain detached execution. A dedicated checkout supervisor would centralize process ownership, but would add discovery, startup, shutdown, and recovery machinery to the product. A durable checkpoint and owned execution attempts fit the current deployment model.

Retain `SessionId` as the immutable round identity used by jobs, refs, leases, and variant commands. Add a separate `ThreadId` for presentation identity. Reusing a single session ID across rounds would make a delayed `show v1` command act on a different generation unless every command acquired another generation field. Keeping immutable round IDs already provides that protection.

Store the journal and round transitions in one atomic checkout checkpoint. A per-session refining marker in a separate file cannot determine whether an interrupted keep already committed. An extra operation-receipt protocol between those files would recreate the compensation. One rename can publish both the file-write intent and the new round states. Existing compare-before-write recovery still owns applying the files and protecting hand edits.

## Checkpoint contract

The checkpoint contains a storage version, the observation counter, the working-tree journal, and rounds keyed by immutable session ID. Session policy and working-tree policy remain separate functions; their durable changes commit together under the existing checkout lock.

Implemented round states are:

| State | Required data | Allowed next states |
| --- | --- | --- |
| Preparing | Ask, complete kept parent, saved planner recipe | Planning with queued attempt, closing |
| Planning | Full input, attempt token, state | Active, closing; explicit retry within planning |
| Active | Generated session and owned variant jobs | Closing |
| Closing | Kept/discarded/refined outcome | Closed |
| Closed | Small terminal outcome | Terminal |
| Legacy refinement | Unconfirmed old parent | Preparing only after proven keep and repost, or closing |

A planning attempt is queued, starting with PID, running with claiming PID, or failed with reason. Its input owns ask, parent, base, open order, parsed config, planner model, and deadline. The nested state retains one input across explicit retries. The public projection is planning, plan-failed, or active. Stable ThreadId is the following presentation unit and is not stored yet.

Preparing is needed for refinement after committing the parent but before capturing its new base. Initial asks can capture their base directly and enter Planning with a queued attempt. The current round of a thread is derived from its nonterminal rounds; do not add a second mutable current-round index.

Implemented for variant jobs: each attempt has a unique token and a tagged state. Queued owns its parsed configuration. Starting owns the launched PID and configuration. Running owns the claiming PID and current phase. Ready/failed are complete terminal outcomes. Only the current token and claiming PID may publish phase, result, or Git ref. Retry creates a new attempt from current host configuration. Closure revokes all job publication before artifact cleanup.

The worker claims starting only when the PID matches, or queued when the launcher died before recording startup. A successfully launched process that exits before claim becomes an explicit retryable interruption. The original queued-only sketch failed this case and was rejected after independent reproduction.

## Operation contracts

`ask` records an accepted Queued round and returns a planning view promptly. An exact repost returns the recorded round, including failure or closure; it does not silently start another attempt. Explicit retry creates a new attempt. The planner runs outside the lock and publishes its result under it.

Detached planner startup claims the queued attempt before running Claude. Several requests may try to start the same accepted queue entry, but only one process wins the claim. A later page/request can recover a queue entry whose HTTP process died before spawning. A dead planning owner becomes a visible recoverable failure.

`refine` first computes the keep plan. Refusal changes nothing. Acceptance atomically records the keep's file intent, closes the old round with its successor ID, and adds Preparing for the next round with its ask and complete parent. Recovery finishes the file write, then Preparing captures the new designer base and becomes Queued. No independent `parent.json` is needed.

`keep` and `discard` publish the tree decision and Closing state together. Cleanup removes refs/artifacts and records Closed. Revoked workers observe lost ownership and stop their own commands asynchronously; the response does not wait for that observation. A terminal tombstone prevents a late repost from reopening the operation. The placement algorithm can omit the closing round from its second pass instead of assigning it an artificial desire to show the original.

Cancellation is durable before process cleanup. A worker observes loss of its recorded ownership, aborts its own child process group, and checks ownership again before publishing. The process-local planning map is removed. Do not send signals based solely on an unverified historical PID.

## Observations and acknowledgements

Implemented: `PageView.observation` is a validated, checkout-scoped increasing integer. Settlement, session/job capture, projection, and numbering share the live-tree lock. Captured session/job data drives both offers and views. The persisted counter survives server restart. Playground reset preserves its counter.

The counter orders observations, not mutations. Session lifecycle and tree intent now publish in the checkpoint under the same lock. Variant phases and outcomes now publish under that lock too. Planner execution now uses the same short checkpoint publication boundary and owns an immutable attempt.

Implemented: the reducer rejects older or duplicate pages. Successful ask/refine acknowledgements are separate `answered` events. An old successful reply still acknowledges its pending command, but reconciliation uses the newer already-accepted page. Otherwise a session closed by another tab could leave an unacknowledged pin forever.

Target: the browser stores presentation metadata by ThreadId, sends variant commands to the current immutable round ID, and keeps local locating/submitting state distinct from accepted server rounds. A refinement changes the round on the same pin; no optimistic ID reversal is needed. Remove `joined` and `pinnedOnce` once this ownership replaces their remaining responsibilities, rather than deleting their current guarantees early.

## Migration

Implemented under the checkout lock: import existing session files into Active rounds, preserve job/ref identifiers and completed results, and copy observation order without resetting it. Dead or unstarted legacy jobs without owned execution inputs become retryable failures. A live pre-token worker blocks migration until it exits; it cannot honor the new publication fence. Once checkpoint.json exists, it is authoritative. Legacy files are retained as ignored migration inputs until their round is cleaned up. Mixed-version bridge/planner writers are unsupported; upgrading requires quiescent old request processes and detached legacy workers. Stable thread derivation will come with ThreadId.

An orphan `parent.json` lacks the new ask and proof that the keep succeeded. It can precede a refused keep followed by discard. It is imported as an explicit legacy-refinement outcome. A repost may promote it only when the checkpoint has a matching kept/refined predecessor outcome and the original request supplies the missing ask. Missing or discarded predecessors remain unresolved and return an explicit refusal directing a fresh ask on reviewed code. Independent review reproduced the discarded-predecessor defect in the first importer; the stricter rule and missing/discarded/kept regression cases supersede that importer.

## Completion evidence

- Duplicate ask submissions create one round and one owned planner execution.
- Two different asks can plan concurrently while short transitions serialize.
- Discard from another process ends planning; a late result cannot reopen the round.
- Retry supersedes the attempt; an older worker cannot publish into it.
- Crashes before, during, and after keep file writes recover both lifecycle and code consistently.
- A crash after refinement keep but before new-base capture resumes Preparing without keeping twice.
- Planner failure after refine remains visible on the same thread with retained parent and retry input.
- Interrupted cleanup reaches a terminal tombstone without resurrection.
- Old-round variant commands do not affect the next round.
- Old replies after acknowledgement, refinement, and closure do not replace newer observations or leave pending pins.
- Playground reset and bridge restart preserve observation ordering.

Earlier boundary tests cover delayed poll after keep, old empty page after acknowledgement, late ask acknowledgement after a newer closed page, concurrent observation uniqueness, restart continuation, and playground reset continuation.

The checkpoint unit adds real Git/permission-failure tests for partial multi-file keep, partial discard preserving a hand edit, and partial refinement followed by reopening and repost. Both the closing parent and complete preparing successor are durable before the first write. Recovery finishes the files before the successor base is captured. A repost uses the original saved ask even if its later payload differs. Refused refinement publishes no successor, and closed ask/refine reposts do not reopen their rounds. Migration tests preserve observation order and completed jobs, expose incomplete unowned jobs as retryable, refuse adoption of live legacy workers, ignore stale legacy input after publication, and distinguish missing/discarded/confirmed-kept predecessors.

Remaining limitations after the planner unit: stable browser thread identity, transport-ambiguity handling, and complete presentation recovery remain open. Preparing now only spans refinement keep recovery. Planner requests no longer own execution, and accepted failed refinement stays visible. Owned cancellation is verified for resistant agent/check/planner children, within the documented process-group boundary. No claim is made for detached descendants or uncatchable worker termination.


## Implemented checkpoint boundary

One withCheckpoint adapter now owns the checkout lock, migration, and atomic metadata publication. withLive layers file recovery and placement onto that same transaction. The live adapter's settle operation accepts the target round map and commits it with the planned journal before file writes. Pure placement policy remains in variant/swap.ts. Keep removes the closing round from the second placement pass; it no longer stores an artificial desire for original code to disguise closure. Discard removes terminal wants after restoration. All future offers must omit closed rounds.

Active plan reads are now named readSession and plannedSessions; runner, suggestions, generation tooling, and tests migrated together. Session publication and job startup recheck the active/preparing state under the checkout lock. Closing retains its immutable session during ref/directory cleanup and then becomes a small Closed tombstone. Running workers lose publication authority as soon as their round stops being Active.


## Owned variant execution

The checkpoint model and jobs adapter replace the old independently published PID/phase/result files. The process adapter launches attempt-specific logs only under the checkpoint lock. A detached worker claims its attempt before reading execution inputs, observes revocation, and publishes every progress/result update through the ownership check. The ready Git ref is written under that same lock before the ready outcome. A crash between ref and checkpoint publication leaves an unannounced artifact that closure removes; it does not announce a successful job.

A second rejected implementation coupled job publication to working-tree recovery. Independent review reproduced a permission failure on an unrelated interrupted file preventing claim/progress/completion. Workers now use withCheckpoint directly and preserve journal.moving verbatim. Only withLive applies those writes. The new regression proves worker publication during blocked recovery and later successful file recovery.

readJobs provides the headless generation script with outcomes and dead-owner recovery without placing variants. Page and retry also persist detected interruptions. The runner publishes terminal state before exit, so dead-owner classification no longer needs a second result-file read. PID liveness is a heuristic for reporting interruption, never authority to signal an arbitrary process.

The process-level tests cover two concurrent claimants, an exited owner, stale phase/ref/result writes after retry, completion racing closure, queued recovery after reopening, cross-process discard during the agent and during a check, startup failure before claim, legacy live/completed/dead workers, and publication with unrelated blocked file recovery. The real Vite integration still generates variants in detached workers and keeps/discards them through the bridge. Fixture cleanup waits for detached runners before deleting their scripted external agent.


## Command cancellation boundary

An executing command owns its detached process group and abort listener. Cancellation sends SIGKILL immediately to that group and awaits the direct child's close event, including its pipes. The adapter returns exited, stopped, or failed values, including launch and stdin errors. Claude and check tools share this adapter. No delayed signal callback or historical persisted PID authorizes a kill.

The variant worker only aborts on SIGTERM or ownership revocation. It awaits its command, unwinds generation, and releases the slot in finally. Slot acquisition checks cancellation before lock/prepare and after preparation. Existing in-flight Git and filesystem preparation completes before unlock. Git add/diff also complete as one awaited transaction because killing Git during an index write leaves index.lock and prevents subsequent checkout. Checks inspect cancellation before and after that transaction.

This guarantee covers owned process groups while commands are running. It does not claim containment of descendants that deliberately detach into another group or background work that survives a normally completed command with closed pipes. Abrupt uncatchable runner termination is also outside graceful cancellation. Durable attempt fencing still prevents stale publication.

## Implemented planner and consumer unit

The implementation includes server planning plus its protocol and consumers. Returning an accepted planning response while keeping active-only PageView would make acknowledgement remove the pending pin. Planning, plan-failed, and active session views now ship together. Planning and failed views retain ID and trail. Active alone owns variants/place/drift and permits flip, keep, baseline measurement, or refine. Planning permits discard; failure permits explicit retryPlan.

The checkpoint persists full planner input (ask, parent, base, opened, config, planner model, deadline), attempt token, and queued/starting/running/failed states. Initial base capture and queue publication share the live lock. A detached entrypoint claims token/PID once, observes revocation, and publishes active plus queued variant jobs under withCheckpoint. Startup death is an explicit interruption. Repost observes; explicit retryPlan creates a new attempt. Request disconnect does not revoke accepted durable work.

Refine retains Preparing while old keep recovery finishes, then captures the next base and queues the planner. Closing accepts unplanned rounds because cleanup needs only round ID and terminal outcome. The process-local planning map, asking wrapper, and long per-session lock are removed. The generation script uses metadata-only recovery so polling a plan never places code. CLI openSessions/discard-all/gc include every nonterminal state. Playground refuses unsupported recorded asks before keeping the old variant. Accepted planner failures remain visible and do not trigger optimistic old-round rollback.

Stable ThreadId remains the following unit, not an excuse to omit planning views. Full O2 remains open until refinement and ambiguous transport failures preserve a presentation identity without optimistic replacement/rollback.

Verification must cover duplicate versus independent asks, startup/restart, durable failure/repost/retry, stale completion, cross-process planner cancellation, blocked unrelated file recovery, refine recovery and visible failure, overlay reload/control availability, CLI all-state cleanup, headless no-placement, and playground refusal preserving the old round.


## Planner verification and remaining boundary

Nine direct planner tests exercise concurrent claims/reposts, cross-process cancellation of a resistant child, accepted-request disconnection, CLI status/GC/discard, interrupted startup, log setup failure, explicit retry and stale completion, ready-variant metadata reads with no live placement, blocked unrelated recovery, and persisted open order. Existing concurrent-ask tests now await detached completion. Refinement tests retain failure after successful keep and require retryPlan before another execution. Overlay tests cover reload, disabled active-only controls, failure/retry/discard, and accepted failed refinement preserving its successor and trail. Replay tests prove invalid refinement/replacement preserves prior state and a valid refinement emits only one successor state.

Independent review rejected uncaught log setup failures and insertion-order page projection. Setup failures now persist as failed attempts; projection sorts active and planning inputs by opened. Initial ask captures base and queued input in one lock. A fresh reviewer verified these corrections and ran 19 planner/refine/UI tests plus 13 replay tests without finding another scoped defect. A built-widget browser check passed eight visible-state/action assertions through a scripted transport. This is rendered consumer evidence; backend subprocess tests establish durable execution independently.

Still open: stable thread identity and transport-ambiguity handling in ask/refine, full overlay lifecycle cleanup, and the rest of the repository inventory. The old optimistic ID reversal remains for ambiguous transport failures until the thread unit replaces it. Unknown local pin metadata still falls back to generic display metadata after reload; the current view union fixes accepted lifecycle visibility, not presentation recovery.


## Implemented stable thread and request recovery boundary

ThreadId is derived from the root SessionId in the immutable Parent chain; it is not a mutable server registry. SessionView projects thread, current words, and targets for all lifecycle variants. The browser reducer derives pins from the latest authoritative page plus unresolved submissions. Command IDs remain immutable round IDs. Card identity and pin number survive local or competing refinements; stale round measurements and predecessor drafts do not.

A tab journal stores one exact unresolved command per thread before POST. Successful receipt and observed successors acknowledge matching requests. Unknown transport outcome remains uncertain and can be retried after reload; closed server and playground receipts settle retries without reopening. A later request's journal cannot be deleted by an older acknowledgement. Malformed storage entries are ignored independently; unavailable storage leaves live commands functional with a visible recovery limitation.

The action controller owns initial ask and refinement lookups through a per-thread request ID. Matching cancellation, successor observation, and unmount revoke lookup authority. A delayed continuation checks ownership before changing targets, persisting, or POST. An older HTTP request may remain pending after a successor observation, but cannot block or overwrite the next refinement. Finalizers remove only their own ownership.

New tests cover canceled initial lookup, canceled refinement plus immediate replacement, competing successor plus late lookup, exact replay after reload, duplicate local submit/retry clicks, old refusal after a newer request, malformed/unavailable storage, unmount during lookup, round draft/measurement ownership, ambiguous imported thread branches, and playground terminal replay. Browser verification uses the real built widget with a scripted transport; backend lifecycle tests independently establish actual persistence and terminal receipts.

Remaining originalBefore timing assumes a full poll proves HMR completion. That is not a provenance guarantee. This is separate from stable thread/request recovery and must be removed or redesigned in the next overlay measurement unit.
