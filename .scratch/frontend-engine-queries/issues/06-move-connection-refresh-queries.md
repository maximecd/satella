# 06 — Move Connection and Refresh queries behind the Portfolio data module

**What to build:** Move Connection reads, maintenance, deletion, and Connection-wide Refresh behind the deep frontend Portfolio data module. A successful operation reconciles every affected Connection, Account, Asset, and Dashboard projection while screens continue to own navigation, toasts, and partial-failure presentation.

**Blocked by:** 01 — Establish the Portfolio data module with Reporting currency.

**Status:** ready-for-agent

- [ ] Connection screens and Refresh actions use the module interface instead of direct engine calls and manual invalidation.
- [ ] Renaming a Connection updates Connection reads and every cached Account or Dashboard projection that displays its name.
- [ ] Deleting a Connection removes its dependent projections from visible frontend state.
- [ ] Refresh reconciles imported Accounts, Assets, prices, and Portfolio value with precise module-owned cache behavior.
- [ ] Full and partial Refresh failures retain the existing concise user feedback and are covered through the module and route test surfaces.

