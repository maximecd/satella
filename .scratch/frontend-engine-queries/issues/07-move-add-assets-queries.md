# 07 — Move Add assets queries behind the Portfolio data module

**What to build:** Move Connection setup, manual Account selection, Asset discovery, holding lookup, and every Add assets write behind the deep frontend Portfolio data module. Each completed flow reconciles exactly the Portfolio projections it changes instead of sweeping unrelated caches.

**Blocked by:** 01 — Establish the Portfolio data module with Reporting currency.

**Status:** resolved

- [x] Every Add assets flow reads and writes through the module interface without direct engine calls or exposed query keys.
- [x] Adding a Connection, holding, Cash Account, or Other Asset immediately produces coherent Dashboard, Connection, Account, Asset, and Settings reads where affected.
- [x] Connector capabilities and Asset discovery retain their specialized freshness and retry behavior behind the module interface.
- [x] The broad invalidate-all-finance behavior is no longer used by migrated Add assets flows.
- [x] Route-level tests cover successful and failed flows through visible behavior, while module tests prove affected and unaffected projections.

## Comments

Add assets reads/writes use the module. Connector capabilities and Asset search keep specialized freshness. Broad invalidate-all-finance is gone.
