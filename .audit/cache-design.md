# Request-owned metadata and initialized host

- [x] Ground
- [ ] Sketch
- [ ] Agree. Full autonomy; no human checkpoint requested.
- [ ] Implement
- [ ] Scrap. Re-evaluate if evidence contradicts the selected ownership.
- [ ] Verify and independently review

B7 currently has two shared promises without valid ownership. The metadata map keys only a file path and mtime while caching a result also dependent on the requested component and all imported modules. A rejection deletes whichever entry currently occupies that path. The handler retains rejected initialization forever.

Candidate A removes the metadata cache and stores only successfully initialized Host values in each handler. Every control request loads the current module graph in its existing isolated subprocess. Failed requests have no shared state to poison or evict. Concurrent host discovery is harmless read-only Git/realpath work; the first successful host defines the handler's fixed checkout/configuration identity.

Candidate B retains in-flight and fulfilled entries with component and complete dependency revision identities. It must obtain transitive dependency revisions, fence publication and evictions, and define handler retry states. That adds a lifecycle solely to support an unproven optimization. Separate read-only design passes are assessing both before implementation.

Callers remain await propControls(repo, component) and await opened(). The candidate A shape is a request-local Promise<PropControl[]> and handler-local Host | undefined, containing only successful initialization. No new public API, global cache owner, revision registry or state-machine framework.

Required evidence includes changed imported metadata with unchanged meta mtime, component-specific results sharing one meta file, and retrying the same HTTP handler after the repository becomes available. Existing real subprocess prop writes and HTTP tests cover the normal path. B8's broad exception classification remains a separate unit.

Paused at the user’s request before implementation. All three reproductions failed against the current code as expected (/tmp/morph-cache-before.log). Unfinished regression tests were removed from the verified commit checkpoint. Both design reviews prefer candidate A; implementation and review remain pending.
