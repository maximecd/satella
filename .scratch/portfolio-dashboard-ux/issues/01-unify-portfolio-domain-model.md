# 01 — Unify the portfolio domain model

**What to build:** Replace the mixed Asset-class, Account-kind, and Custodian model with the canonical portfolio model. Assets use one of the seven intrinsic Asset categories everywhere; Accounts are neutral containers that may optionally belong to a Connection; Connector imports and Add assets use the same vocabulary and behavior. Remove the legacy concepts rather than preserving compatibility surfaces.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Persist and expose the stable Asset categories Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, and Other assets. Pre-production: migration 0005 reshapes the schema generically and discards existing user rows; seeded cash currencies are recategorized in place.
- [x] Remove Account kind from persistence, Connector contracts, Finance API contracts, creation and filtering behavior, and visible presentation.
- [x] Model a connected Account as optionally owned by one Connection and a manual Account as having no Connection; remove Custodian, institution, presentation-role, and management-mode concepts.
- [x] Update Connector discovery and output to use Asset categories, including the specified OKX and IBKR mappings, with contract and reconciliation coverage.
- [x] Make Add assets use the same seven categories, including a Cash flow that selects or creates a neutral Account, currency, and balance and generic manual entry where specialized discovery is unavailable.
- [x] Delete obsolete compatibility aliases and prove the final schema invariants and public behavior through migration, service, Connector, API, and route-level tests.

## Comments

- 2026-08-15: Migration is intentionally not a data backfill. Existing portfolio rows are dropped; reset the database after pulling this change.
