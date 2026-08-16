# 02 — Make Asset maintenance atomic

**What to build:** Make editing an Asset's name, symbol, and optional manual price one engine-owned task. A person receives one complete success or failure, and a failed price change cannot leave the Asset metadata partially updated.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] One Asset-maintenance operation accepts the complete editable outcome and validates it before persistence.
- [ ] Metadata and manual-price changes commit together or roll back together.
- [ ] The Asset editing screen submits one task and preserves its existing accessible success and failure behavior.
- [ ] Engine tests prove complete success, validation failure, not-found behavior, and rollback when either persistence step fails.
- [ ] Route-level tests assert the visible Asset result rather than a sequence of engine calls.

