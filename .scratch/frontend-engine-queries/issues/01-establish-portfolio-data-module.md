# 01 — Establish the Portfolio data module with Reporting currency

**What to build:** Introduce the deep frontend Portfolio data module through one complete Reporting-currency slice. Dashboard reads and Reporting-currency changes use one typed engine interface with production HTTP and in-memory test adapters; the module owns query policy, failure normalization, and cache coherence while screens retain presentation, navigation, and feedback.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Dashboard and Settings obtain Portfolio and Reporting-currency data through the new module rather than learning transport operations or query keys.
- [x] Saving a Reporting currency immediately produces coherent Settings and Dashboard reads without a redundant invalidate-after-write sequence.
- [x] The production HTTP adapter owns engine location, transport decoding, cancellation, and conversion of engine failures into the frontend failure model.
- [x] A typed in-memory adapter satisfies the same interface and supports coherent read-after-write route tests.
- [x] Tests exercise the module interface and accessible Dashboard and Settings behavior without asserting internal cache keys or transport call sequences.

## Comments

Dashboard and Settings now read and save Reporting currency through the Portfolio module (HTTP + in-memory adapters). Cache coherence lives in the module; screens keep presentation only.
