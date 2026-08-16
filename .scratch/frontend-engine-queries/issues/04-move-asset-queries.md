# 04 — Move Asset queries behind the Portfolio data module

**What to build:** Move Asset listing, detail, maintenance, pricing, and deletion behind the deep frontend Portfolio data module. After every Asset change, all affected Asset, Account, and Dashboard projections are coherent without screens knowing query keys or invalidation rules.

**Blocked by:** 01 — Establish the Portfolio data module with Reporting currency; 02 — Make Asset maintenance atomic.

**Status:** ready-for-agent

- [ ] Asset screens use the Portfolio data module for reads and writes and no longer coordinate engine operations directly.
- [ ] Editing an Asset reconciles its list and detail reads plus every affected Account and Dashboard projection.
- [ ] Deleting an Asset removes or refreshes every projection that could still display it or include its value.
- [ ] Query policy, returned-data reconciliation, and affected-projection invalidation remain private implementation details of the module.
- [ ] Module and route-level tests prove coherent visible results without asserting internal cache keys or refetch counts.

