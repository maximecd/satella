# 08 — Contract the legacy frontend query path

**What to build:** Complete the expand-contract refactor after all finance callers use the deep Portfolio data module. Remove the shallow direct engine pass-throughs, exposed query-key knowledge, broad invalidation helper, and untyped test substitute so there is one frontend engine seam and one test surface.

**Blocked by:** 04 — Move Asset queries behind the Portfolio data module; 05 — Move Account and Position queries behind the Portfolio data module; 06 — Move Connection and Refresh queries behind the Portfolio data module; 07 — Move Add assets queries behind the Portfolio data module.

**Status:** ready-for-agent

- [ ] No finance screen, route, or helper calls the generated engine client or manipulates query keys directly.
- [ ] The broad finance invalidation helper and untyped property-generating test substitute are deleted.
- [ ] The production HTTP adapter and typed in-memory adapter are the only frontend adapters at the engine seam.
- [ ] Query policy, cache dependencies, and failure normalization have locality inside the Portfolio data module.
- [ ] The complete frontend test suite, type check, and production build pass with no compatibility facade for the removed path.

