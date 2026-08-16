# 05 — Move Account and Position queries behind the Portfolio data module

**What to build:** Move Account and Position reads and writes behind the deep frontend Portfolio data module. Account details and Portfolio value remain coherent after Account or Position changes, while screens retain only form, navigation, and feedback behavior.

**Blocked by:** 01 — Establish the Portfolio data module with Reporting currency; 03 — Return a focused Position-edit read model.

**Status:** resolved

- [x] Account and Position screens use the module interface rather than direct engine operations or exposed query keys.
- [x] Updating or deleting a Position reconciles its focused edit read, owning Account, and Dashboard projections.
- [x] Updating an Account reconciles Account detail and every projection containing its name, currency, or value.
- [x] Deleting an Account removes it from Dashboard and from all cached Account collections relevant to Add assets.
- [x] Tests execute each task and observe affected reads through the module interface and accessible screens.

## Comments

Account and Position reads/writes go through the module. Position and Account changes reconcile focused edit, owning Account, Dashboard, and Add-assets account collections.
