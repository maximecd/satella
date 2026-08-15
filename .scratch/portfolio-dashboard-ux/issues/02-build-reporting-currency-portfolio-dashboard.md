# 02 — Build the Reporting-currency portfolio dashboard

**What to build:** Make Dashboard the primary portfolio overview. Persist a Reporting currency, default it to USD, and use it consistently for the current Portfolio value, Account values, historical observations, and allocation. Present an accessible, responsive overview with honest sparse and exceptional states instead of fabricating or hiding financial information.

**Blocked by:** 01 — Unify the portfolio domain model.

**Status:** resolved

- [x] Persist a supported Cash Asset as the Reporting currency, default it to USD, expose read/update operations, and immediately invalidate all affected portfolio reads after a change while preserving each Account's native valuation currency.
- [x] Return a consistent server-aggregated dashboard model containing Reporting currency, Portfolio value and completeness, Reporting-currency Account rows, Asset and Asset-category allocation, exception counts, and actual historical observations.
- [x] Show the focused Add assets onboarding state when no Account contains meaningful Assets; otherwise show the wide Portfolio value card, allocation card, and edge-to-edge Account list with Accounts sorted by Reporting-currency value and then name.
- [x] Provide 7D, 1M, 3M, YTD, 1Y, and All Portfolio value ranges with 1M selected initially, accessible tooltips, first-to-last absolute and percentage change, sparse observations, and “Not enough history” when fewer than two points exist.
- [x] Capture the FX information needed to recompute history in every supported Reporting currency, keep multiple snapshots in persistence, show at most one observation per calendar day in the UI, and never synthesize missing-day observations.
- [x] Aggregate identical Assets across Accounts and switch the accessible treemap between Assets and Asset categories; omit zero and unpriced geometry, disclose unpriced counts, and flag negative holdings without forcing them into positive area.
- [x] Use Astryx layout primitives and chart components when suitable charts are available; otherwise use a proper charting library such as Recharts for the accessible area chart and treemap. Do not hand-roll charting with repository-native SVG/canvas code or install the placeholder Astryx charts package. Ensure the two-thirds/one-third desktop grid stacks before it becomes cramped and verify it at wide, intermediate, and narrow viewports in light and dark themes.
- [x] Cover the public Finance boundary and route-level accessible behavior, including currency changes, conversions, sorting, range selection, sparse history, allocation toggling, keyboard-focusable cells, tooltips, and exceptional valuation states.

## Comments

- 2026-08-15: Multiple snapshots may exist on the same calendar day in persistence. One observation per day is a chart/UI rule (latest point that day), not a database uniqueness or upsert constraint.

## Answer

Reporting currency is persisted in `app_settings` (default USD) with GET/PATCH `/api/settings`. The dashboard API returns one server-aggregated model; history keeps every captured snapshot and converts through the USD FX pivot. The client collapses to the latest observation per UTC day for the chart. Snapshots are always inserted; there is no same-day uniqueness constraint.
