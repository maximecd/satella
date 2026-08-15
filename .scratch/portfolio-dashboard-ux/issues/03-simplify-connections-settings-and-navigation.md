# 03 — Simplify Connections, Settings, and navigation

**What to build:** Turn Settings and the application shell into a focused, quiet management experience. Provide consistent Connection-wide Refresh and Connection editing, remove obsolete screens and routine operational metadata, and simplify the persistent sidebar while retaining concise actionable exceptions.

**Blocked by:** 01 — Unify the portfolio domain model.

**Status:** claimed

- [x] Make Settings a focused landing page with the auto-saving Reporting-currency selector and one Connections navigation row, without tabs, diagnostic sections, or another Settings sidebar.
- [x] Provide dedicated Connections list, detail, and editing routes showing Connection name, Account count, icon-only Refresh, and Edit; support name and credential updates plus clearly separated confirmed deletion.
- [x] Make Refresh operate on the entire owning Connection and expose the same ghost icon action beside a connected Account title, a Connection title, and each Connections Settings row; omit it for manual Accounts.
- [x] On successful Refresh, import current data, capture a new Portfolio snapshot, invalidate affected reads, and show a success toast; show loading and concise full or partial failure feedback without persistent healthy-state chrome.
- [x] Delete obsolete Custodian, institution, wallet, and diagnostic routes and screens, preserving only naturally reachable Asset editing and using canonical Account, Asset category, Portfolio value, Reporting currency, Connection, and Refresh copy.
- [x] Remove routine Manual, Connected, Synced, Delayed, source-name, quote-time, connector-managed, and provider-metadata labels and banners while retaining incomplete valuation, unpriced Asset, and Refresh-failure exceptions and meaningful choices such as Add manually.
- [x] Reduce the sidebar to Optimus, Dashboard, and Settings with semantic icons, correct nested-route selection, a centered footer collapse control, collapsed-state tooltips, and locally persisted collapse state.
- [ ] Prove Connection management, Refresh scope, manual-Account behavior, destructive confirmation, shell accessibility, persisted collapse state, obsolete-route removal, and decluttering through service and route-level tests plus browser verification.

## Comments

Service and route-level tests cover Settings, Connections, Refresh scope, manual-Account omission, deletion confirmation, nested Settings selection, and persisted collapse. Browser verification of wide/narrow layout, footer collapse centering, and collapsed tooltips is still outstanding. Add-assets search still shows provider names; that flow was left unchanged in this ticket.
