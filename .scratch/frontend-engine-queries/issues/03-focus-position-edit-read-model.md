# 03 — Return a focused Position-edit read model

**What to build:** Give Position editing a task-shaped read model containing the Position and only the Account context needed to display, update, delete, and return from the edit flow. The frontend no longer downloads an entire Account and searches its Positions to begin the task.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The engine returns the requested Position with the minimal Account and Connection context required by the edit flow.
- [ ] Missing Positions produce the canonical finance failure without relying on frontend array searches.
- [ ] Position editing renders, updates, deletes, and navigates correctly from the focused read model.
- [ ] Engine tests cover the focused read model for manual and connected Accounts plus not-found behavior.
- [ ] Route-level tests verify accessible Position-edit behavior without asserting an Account-shaped response.

