# 01 — Unify the portfolio domain model

**What to build:** Replace the mixed Asset-class, Account-kind, and Custodian model with the canonical portfolio model. Assets use one of the seven intrinsic Asset categories everywhere; Accounts are neutral containers that may optionally belong to a Connection; Connector imports and Add assets use the same vocabulary and behavior. Remove the legacy concepts rather than preserving compatibility surfaces.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Persist and expose the stable Asset categories Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, and Other assets, with existing data backfilled according to the specification.
- [ ] Remove Account kind from persistence, Connector contracts, Finance API contracts, creation and filtering behavior, and visible presentation.
- [ ] Model a connected Account as optionally owned by one Connection and a manual Account as having no Connection; remove Custodian, institution, presentation-role, and management-mode concepts.
- [ ] Update Connector discovery and output to use Asset categories, including the specified OKX and IBKR mappings, with contract and reconciliation coverage.
- [ ] Make Add assets use the same seven categories, including a Cash flow that selects or creates a neutral Account, currency, and balance and generic manual entry where specialized discovery is unavailable.
- [ ] Delete obsolete compatibility aliases and prove the final schema invariants and public behavior through migration, service, Connector, API, and route-level tests.
