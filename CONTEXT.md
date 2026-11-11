# Morph vocabulary

| Concept | Name | Replaces | Avoid |
| --- | --- | --- | --- |
| One conversation across refinements | ThreadId | Mutable pin session ID | Treating a round ID as thread identity |
| One immutable ask and its generated alternatives | SessionId / round | Optimistically replaced pin ID | Reusing a round for another ask |
| One browser target slot with a locator and reference | PinnedTarget, pin.targets | Picked, pin.picked | Parallel arrays of locations and measurements |
| A measured visible element at an explicit moment | ReferenceMeasurement, target.reference | Pin.baseline | Calling an unverified DOM snapshot the original |
| Capture a target before its first ask | captureTarget | pickedOf | Implicit capture during polling |
| Resolve target slots without removing or merging them | resolveTargets | repicked | Assuming array index survives filtering |
| Connected DOM elements for commands and layout | targetElements | targetsOf | Treating location recovery as identity proof |
| Inspector comparison with saved target measurements | Comparison, comparisonsFor | Shown, shownOver | Attributing measured DOM to a server placement |

Target slots retain order for the life of a thread. Each owns its reference. A selected DOM element and an element recovered at a saved position are different match states. A saved reference records what was visible, independently of current round or file placement. Browser storage serializes the locator and measurement; DOM matches are resolved anew after reload.
