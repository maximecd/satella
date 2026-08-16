# 05 — Move Account and Position queries behind the Portfolio data module

**What to build:** Move Account and Position reads and writes behind the deep frontend Portfolio data module. Account details and Portfolio value remain coherent after Account or Position changes, while screens retain only form, navigation, and feedback behavior.

**Blocked by:** 01 — Establish the Portfolio data module with Reporting currency; 03 — Return a focused Position-edit read model.

**Status:** ready-for-agent

- [ ] Account and Position screens use the module interface rather than direct engine operations or exposed query keys.
- [ ] Updating or deleting a Position reconciles its focused edit read, owning Account, and Dashboard projections.
- [ ] Updating an Account reconciles Account detail and every projection containing its name, currency, or value.
- [ ] Deleting an Account removes it from Dashboard and from all cached Account collections relevant to Add assets.
- [ ] Tests execute each task and observe affected reads through the module interface and accessible screens.

