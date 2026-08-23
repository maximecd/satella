# Portfolio dashboard and UX simplification

Status: ready-for-agent

## Problem Statement

Satella exposes implementation details instead of presenting a calm, trustworthy portfolio experience. Its sidebar contains missing icons, redundant labels, and a poorly aligned collapse control. The dashboard is only an Account list, so it does not answer the primary questions of total Portfolio value, historical evolution, or allocation. Routine management modes, market-data sources, freshness labels, timestamps, and explanatory banners create noise throughout the application. Settings combines Connections with obsolete institution and diagnostic surfaces instead of providing focused subpages.

The underlying model also mixes intrinsic Asset classification with Account kinds. This prevents Add assets and portfolio allocation from sharing one precise taxonomy and misclassifies cases such as cash held in a brokerage Account.

## Solution

Make the dashboard the primary portfolio overview. Present a wide, responsive Astryx grid with a dominant Portfolio value and history card, an allocation treemap switchable between Assets and Asset categories, and the existing Account list simplified beneath them. All portfolio-wide values use the persisted Reporting currency, which defaults to USD.

Use one intrinsic Asset category taxonomy everywhere: Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, and Other assets. Accounts become untyped containers. A Connection is the optional external source of one or more Accounts; manually created Accounts exist without a Connection.

Remove routine provenance and healthy-state metadata from the application. Silence represents healthy and current data. Preserve concise, actionable exceptions when a valuation is incomplete or a refresh fails. Replace “resync” with a consistent, icon-only Connection refresh action.

Retain the sidebar for future expansion, but simplify and repair it. Restructure Settings into a focused landing page containing Reporting currency and a link to a dedicated Connections subpage. Delete obsolete pre-production routes and screens instead of maintaining redirects.

## User Stories

1. As a portfolio owner, I want to see my total Portfolio value immediately, so that I understand my current financial position.
2. As a portfolio owner, I want all portfolio-wide values expressed in one Reporting currency, so that values from different Accounts are comparable.
3. As a new user, I want USD selected as the initial Reporting currency, so that the dashboard works without setup.
4. As a portfolio owner, I want to change my Reporting currency in Settings, so that Satella matches how I think about my wealth.
5. As a portfolio owner, I want my Reporting currency preference remembered, so that I do not need to select it again.
6. As a portfolio owner, I want changing Reporting currency to update totals, history, allocations, and Account values together, so that the dashboard remains internally consistent.
7. As a portfolio owner, I want individual Accounts to retain their native valuation currencies, so that changing the portfolio display does not mutate Account data.
8. As a portfolio owner, I want to see how Portfolio value evolved, so that I can understand its historical direction.
9. As a portfolio owner, I want the history card described as Portfolio value rather than performance, so that deposits are not misrepresented as investment returns.
10. As a portfolio owner, I want to select 7D, 1M, 3M, YTD, 1Y, or All, so that I can inspect useful historical periods.
11. As a returning user, I want 1M selected initially, so that I begin with a useful recent view.
12. As a portfolio owner, I want to see the absolute and percentage change for the selected period, so that I can quantify the movement in Portfolio value.
13. As a portfolio owner, I want chart tooltips to show the observation date and value, so that I can inspect exact historical values without persistent clutter.
14. As a portfolio owner, I want missing snapshot days left as missing observations, so that Satella does not fabricate financial history.
15. As a portfolio owner with little history, I want “Not enough history” instead of a false zero-percent change, so that the application remains honest.
16. As a portfolio owner, I want the graph to use the latest Snapshot from each day, so that it reflects the latest imported data without discarding intraday history.
17. As a portfolio owner, I want the graph to show at most one point per day, so that repeated Refreshes do not crowd the chart.
18. As a portfolio owner, I want to see my allocation by individual Asset, so that I can identify concentrated holdings.
19. As a portfolio owner, I want the same Asset held in multiple Accounts combined into one allocation cell, so that exposure is not fragmented by custody.
20. As a portfolio owner, I want to switch allocation between Assets and Asset categories, so that I can move between detailed and strategic views.
21. As a portfolio owner, I want allocation tooltips to show Asset name, symbol, value, and percentage, so that even small treemap cells remain understandable.
22. As a keyboard user, I want every allocation cell focusable with an accessible label and tooltip, so that the treemap is not mouse-only.
23. As a portfolio owner, I want zero-valued Assets omitted from allocation, so that they do not create meaningless cells.
24. As a portfolio owner, I want unpriced Assets excluded with a concise count, so that missing valuation is disclosed without filling the dashboard with warnings.
25. As a portfolio owner, I want negative holdings flagged rather than forced into a positive-area treemap, so that allocation is not misleading.
26. As a portfolio owner, I want to see my Accounts below the dashboard visuals, so that I can move from overview to detail.
27. As a portfolio owner, I want Accounts ordered by Reporting-currency value, so that the most financially significant Accounts appear first.
28. As a portfolio owner, I want each Account row to show its name, Connection when present, holding count, and Reporting-currency value, so that it is informative without status noise.
29. As a portfolio owner, I want an Account row to open that Account, so that I can inspect its holdings.
30. As a new user, I want one focused Add assets empty state instead of empty charts, so that I have an obvious next action.
31. As a portfolio owner, I want Assets classified as Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, or Other assets, so that allocation uses financially meaningful categories.
32. As a portfolio owner, I want Add assets to use the same categories as allocation, so that terminology does not change between data entry and reporting.
33. As a portfolio owner, I want category to belong to the Asset, so that its classification remains consistent across Accounts.
34. As a portfolio owner, I want Accounts to accept any combination of Assets, so that cash in a brokerage or mixed Accounts are modeled correctly.
35. As a portfolio owner adding Cash, I want to choose or create a neutral Account, currency, and balance, so that Current and Savings Account kinds are unnecessary.
36. As a portfolio owner, I want Account names such as “Current account” or “Livret A” to convey purpose, so that the data model does not constrain my organization.
37. As a portfolio owner, I want connected imports classified into the same Asset categories as manual Assets, so that allocations remain consistent regardless of source.
38. As a portfolio owner, I want routine labels such as Manual, Connected, Synced, and Delayed removed, so that the interface focuses on financial information.
39. As a portfolio owner, I want market-data source names and exact quote times hidden during normal use, so that operational metadata does not distract me.
40. As a portfolio owner, I want connector-managed and provider-metadata information banners removed, so that read-only implementation details are not presented as alerts.
41. As a portfolio owner, I want incomplete totals, unpriced Assets, and refresh failures retained as exceptions, so that clean design does not hide inaccurate data.
42. As a portfolio owner, I want workflow choices such as Add manually retained, so that removing status labels does not remove meaningful decisions.
43. As a portfolio owner, I want a small refresh icon beside a connected Account title, so that I can request current Connection data without a prominent button.
44. As a portfolio owner, I want refreshing a connected Account to refresh its entire owning Connection, so that related Accounts remain consistent.
45. As a portfolio owner, I want the same refresh action beside a Connection title and in its Settings row, so that refresh behaves consistently throughout the app.
46. As a portfolio owner, I want a loading indicator and success toast for refresh, so that I know the request is progressing and completed.
47. As a portfolio owner, I want refresh failures surfaced concisely, so that I can act without persistent healthy-state chrome.
48. As a portfolio owner with a manual Account, I do not want an inapplicable Connection refresh icon, so that actions remain honest about their scope.
49. As a portfolio owner, I want Settings to show Reporting currency and a Connections link, so that its landing page remains focused.
50. As a portfolio owner, I want a dedicated Connections subpage, so that external service configuration is separated from general preferences.
51. As a portfolio owner, I want each Connection row to show its name, Account count, refresh action, and Edit action, so that I can manage it without status metadata.
52. As a portfolio owner, I want to edit a Connection’s name and credentials, so that its configuration can be maintained.
53. As a portfolio owner, I want Connection deletion clearly separated as destructive, so that it is difficult to trigger accidentally.
54. As a portfolio owner, I want obsolete Institutions & wallets and Advanced data sections removed, so that Settings contains only supported user tasks.
55. As a portfolio owner, I want obsolete Custodian and diagnostic screens deleted, so that technical vocabulary and dead-end routes no longer leak into the product.
56. As a portfolio owner, I want the sidebar to show only Satella, Dashboard, and Settings for now, so that it is ready for future destinations without redundant grouping.
57. As a portfolio owner, I want working Dashboard and Settings icons, so that navigation is quickly scannable.
58. As a portfolio owner, I want the collapse control centered in the sidebar footer, so that it feels intentional and easy to target.
59. As a portfolio owner, I want the collapsed sidebar to use icon tooltips, so that destinations remain understandable.
60. As a portfolio owner, I want the sidebar’s collapsed state remembered locally, so that my layout preference persists.
61. As a mobile or narrow-screen user, I want dashboard cards to stack before they become cramped, so that charts remain legible.
62. As a wide-screen user, I want the dashboard to use the available canvas, so that the primary visualizations are not constrained to the old narrow column.
63. As an assistive-technology user, I want controls, charts, warnings, and navigation to have meaningful accessible names, so that the redesigned experience remains operable.

## Implementation Decisions

- Follow the project glossary and ADR-0001. Use Account, Asset, Asset category, Portfolio value, Reporting currency, Connection, Connector, Refresh, and market-data source with their documented meanings. “Connector” remains technical; normal UI copy says Connection.
- Replace the persisted Asset class enum with Asset category values for Stocks & ETFs, Bonds, Crypto, Cash, Derivatives, Commodities, and Other assets. Use stable machine values independent of display labels.
- Remove Account kind from persistence, Connector contracts, API contracts, account creation, filtering, and presentation. Accounts are neutral containers.
- Replace the Custodian-shaped product model with Connections and optionally connected Accounts. A connected Account references one Connection; a manual Account has no Connection. Remove manual institution/custodian grouping from user workflows.
- Remove management-mode and source-state concepts wherever they become redundant. Connection presence determines whether an Account is refreshable; it is not displayed as a status label.
- Backfill pre-existing Assets using the closest intrinsic category: fiat to Cash, crypto to Crypto, custom to Other assets, and generic security to Stocks & ETFs unless the importing Connector can provide a more precise subtype. Pre-production compatibility aliases are not required.
- Update Connector output to carry Asset category rather than the old Asset class and Account kind. OKX imports Crypto. IBKR maps stocks and funds to Stocks & ETFs; bills, bonds, and notes to Bonds; currency balances to Cash; futures, options, CFDs, forwards, warrants, and similar contracts to Derivatives; commodities to Commodities; and unknown supported records to Other assets.
- Connector discovery advertises supported Asset categories. Manual Add assets exposes the same seven-category vocabulary. Categories without provider search support use generic manual entry until a specialized discovery flow exists.
- Consolidate the former Current and Savings flows into Cash. The user selects or creates an Account, selects a currency, and enters a balance.
- Persist application settings with a Reporting-currency reference. Default to USD when no preference exists. Validate that the selected reporting Asset is a supported Cash currency.
- Expose read and update operations for Settings. Changing Reporting currency saves immediately and invalidates all portfolio-wide read models. The selector uses the ten currently seeded fiat currencies.
- Keep each Account’s native valuation currency. Reporting currency controls only portfolio-wide presentation and conversions.
- Expand the dashboard read model to return its Reporting currency, Portfolio value, completeness state, Reporting-currency Account rows, per-Asset allocation, per-category allocation, and exception counts. Prefer server-side financial aggregation and conversion so every client consumes one consistent result.
- Aggregate identical Assets across Accounts for the Asset allocation. Category allocation sums those Asset values by intrinsic category. Percentages use the positive, priced allocation denominator.
- Exclude zero and unpriced Assets from treemap geometry. Report the unpriced count. Do not force negative values into treemap area; report their presence as an exception while retaining them in Portfolio value according to existing valuation semantics.
- Historical Portfolio values are recomputed in the active Reporting currency using captured historical prices and FX information. Snapshot capture must include the FX data needed for every supported Reporting currency rather than assuming USD.
- Every completed Refresh persists one Snapshot, including multiple Snapshots on the same calendar day. The history API returns those actual observations without generating missing-day values. The dashboard graph shows the latest Snapshot from each calendar day and filters those displayed points into 7D, 1M, 3M, YTD, 1Y, and All ranges.
- The selected-period change compares the first and last available points. Fewer than two points yields “Not enough history.” The dashboard defaults to 1M.
- Build the dashboard with Astryx AppShell/Layout, Grid/GridSpan, Card, Stack, List, SegmentedControl, IconButton, Tooltip, and typography primitives. The Portfolio value and allocation widgets are independent Cards; the dense Account list remains edge-to-edge and is not Card-wrapped.
- Use a three-column desktop grid: Portfolio value spans two columns, allocation spans one, and Accounts span the full following row. Use responsive reflow so the two visualization cards stack when their contents would become cramped. Expand the page content budget beyond the current narrow layout using Astryx layout APIs and tokens.
- Use Astryx chart components when Astryx provides stable, suitable chart primitives. If Astryx does not provide the required charts, use a proper charting library such as Recharts for the area chart and treemap, composed inside Astryx layout/components and styled through theme tokens or `useTheme`. Do not hand-roll charting with repository-native SVG/canvas code, and do not install the published placeholder Astryx charts package.
- Treemap cells support pointer hover and keyboard focus. Every cell has an accessible label and tooltip containing Asset/category name, Reporting-currency value, and percentage. Render an in-cell label only when geometry allows it. The initial treemap is informational and has no click navigation.
- The Portfolio value Card shows its title, current total, selected-period absolute and percentage change, range SegmentedControl, accessible area chart, and a compact incomplete-valuation warning when applicable.
- The allocation Card uses an Assets/Categories SegmentedControl and a concise excluded-Asset note when applicable.
- Account rows show Account name, optional Connection name, holding count, and total in Reporting currency. Sort descending by Reporting-currency value and then by Account name. Rows navigate to Account detail.
- Preserve a focused Add assets empty state when no Accounts contain meaningful Assets; do not render empty zero charts.
- Retain routine workflow language such as Add manually, but remove passive Manual, Connected, Synced, Delayed, source, quote-time, connector-managed, and provider-metadata labels and banners throughout visible screens.
- Preserve only actionable exceptional states: incomplete valuation, unpriced Assets, refresh failure, and partial refresh failure. Healthy state has no indicator.
- Refresh is a Connection-wide operation. Show the same ghost refresh IconButton with tooltip and loading state beside a Connection title, beside the title of any Account owned by that Connection, and in each Connections Settings row. Manual Accounts do not show it. Successful refresh uses a toast; failure uses a concise exception message.
- Retain the SideNav deliberately for expected future navigation. Its header is Satella only. Remove the Finance workspace subtitle and Workspace section title. Register working semantic icons for Dashboard, Settings, and Refresh.
- Use a controlled, locally persisted SideNav collapsed state. Disable the built-in collapse placement and render Astryx SideNavCollapseButton centered in the footer. Collapsed navigation remains icon-only with tooltips.
- Settings landing contains the inline, auto-saving Reporting currency Selector and a Connections navigation row only. Do not add settings tabs or another settings sidebar yet.
- Connections Settings lists Connection name, Account count, ghost Refresh action, and Edit navigation. Its empty state points to Add assets.
- Connection editing supports name and credentials. Delete Connection is a separated destructive action with confirmation. Refresh sits beside the page title rather than in the form.
- Add focused Settings routes for the Connections list, Connection detail, and Connection editing. Because the application is pre-production, delete obsolete Custodian, institution, and diagnostic list routes/screens rather than adding redirects or compatibility behavior. Preserve only Asset editing that is naturally reachable from an Account holding.
- Update breadcrumbs and visible copy so Custodian, provider, institution, resync, asset class, and account kind do not appear as synonyms for canonical concepts.
- Follow Astryx rules: frame with AppShell/Layout, use components for layout rather than raw layout elements, use component props before custom styling, use design tokens for styling, use rows for dense data, and reserve Cards for dashboard widgets and focused settings groups.

## Testing Decisions

- Tests assert externally visible behavior and public contracts rather than component structure, SQL query shape, CSS classes, SVG path coordinates, or implementation-specific state.
- Use the Finance HTTP API/service boundary as the primary engine seam. It should prove Asset category contracts, neutral Accounts, Settings persistence, Reporting-currency conversion, dashboard aggregation, allocation aggregation, exception counts, historical conversion, and Connection-wide refresh behavior.
- Use the existing migration-test pattern only for schema invariants that cannot be proven through the API: removal/backfill of Account kind and Asset class, category backfill, optional Connection ownership, and Reporting-currency default.
- Extend existing Connector contract and reconciliation tests to prove that imported Accounts no longer require kinds and that OKX/IBKR source records map to the agreed Asset categories.
- Extend portfolio service tests to cover totals in multiple currencies, historical FX conversion, same-Asset aggregation across Accounts, category aggregation, unpriced/zero/negative handling, and snapshot capture of FX for every supported Reporting currency.
- Use the existing route-level in-memory router and query-client harness as the primary web seam. Mock the engine API and assert rendered behavior through accessible roles, names, links, and user interactions.
- Dashboard route tests cover the onboarding state, three-section populated state, default 1M selection, every range selection, change calculation, sparse history, Assets/Categories toggle, accessible treemap cells, exception messages, sorted Account rows, and Reporting-currency values.
- Settings route tests cover the minimal landing page, immediate Reporting-currency save, success/failure feedback, navigation to Connections, empty/populated Connection lists, refresh, editing, and destructive deletion confirmation.
- Account and Connection route tests prove title-adjacent refresh visibility and Connection-wide scope. Manual Account tests prove the refresh action is absent.
- Shell tests prove visible labels and accessible navigation: Satella-only heading, Dashboard and Settings icons with correct names, no Workspace text, persisted collapse state, and Settings selection on nested routes.
- Decluttering regression tests assert that routine management/source/freshness text is absent while incomplete valuation, unpriced Asset, and refresh-failure states remain visible.
- Test charts through their semantic interface, regardless of whether they are provided by Astryx or a charting library: chart label, focusable cells, tooltip content, range/toggle controls, and empty/sparse states. Do not snapshot or assert generated geometry.
- Perform browser-based visual verification at wide, intermediate, and narrow viewport sizes for the 2/3–1/3 grid, stacked fallback, Account list alignment, sidebar collapse-button centering, tooltip positioning, chart legibility, focus states, and light/dark theme token behavior.
- Existing dashboard, Settings, Account, Connection/Custodian, portfolio-service, Connector, API-surface, and migration tests are the prior art. Adapt or replace tests whose old vocabulary or routes are intentionally removed.

## Out of Scope

- True investment performance, time-weighted return, money-weighted return, or any calculation adjusted for deposits and withdrawals.
- Modeling cash flows or transactions.
- A 1D chart range or displaying multiple intraday Snapshots from the same day.
- Fabricated or interpolated historical observations.
- Full liability, debt, or short-position allocation visualization.
- Treemap click-through or a new portfolio-level Asset detail page.
- Specialized manual discovery forms for every new Asset category beyond the generic fallback.
- Exposing market-data source names, routine freshness, exact quote times, last-refresh times, or healthy Connection status.
- Additional Settings sections, Settings tabs, or a nested Settings navigation panel.
- Production URL compatibility, redirects, deprecation periods, or preservation of obsolete diagnostic screens.
- Additional top-level sidebar destinations beyond Dashboard and Settings.
- Installing the placeholder Astryx charts package.

## Further Notes

- “Silence means healthy” is a presentation rule, not permission to suppress inaccurate financial information. Exceptional valuation and refresh conditions remain visible and testable.
- The initial graph is Portfolio value, not performance. Copy and tests must preserve that distinction until cash flows are modeled.
- The seven-category taxonomy is intentionally shared by storage, Connector output, Add assets, and allocation. Do not introduce parallel user-facing classification vocabularies.
- The application is pre-production, so obsolete routes and model compatibility layers should be removed rather than maintained.
- The specification respects the project glossary and ADR-0001. If implementation uncovers a need to reintroduce Account classification or a second Asset taxonomy, that conflicts with the recorded domain decision and must be raised explicitly.
