# Spec: Reliable Auto-refresh and Sync log

Status: ready-for-agent

## Problem Statement

Satella promises to refresh a Portfolio immediately after Vault unlock and every fifteen minutes after that, but the desktop tray can remain stuck on "Pas encore actualisé." Production wiring gives the Vault and Auto-refresh scheduler different unlock signals, so the scheduler may never receive the event that starts its work. The managed runtime can also be absent when Vault and scheduler services acquire it. Existing tests assemble those services differently from production and miss the defect.

The status line is the wrong cure. It adds scheduler state, desktop messages, API contracts, formatting, and persistence questions without telling the user what Satella actually checked. Genuine background failures live in a plaintext file outside the Vault, where the Settings interface cannot explain them.

Price handling also carries a distinction Satella does not need. A valid closing price from Friday is normal on Saturday, yet finance contracts classify Price observations older than five minutes as stale. That classification leaks through Position and Account read models even though the interface does not use it. Quote age must not become an error, alert, outcome, or special stored state.

## Solution

Repair the production Auto-refresh composition so one Vault unlock starts one immediate cycle and the fixed fifteen-minute schedule continues while the Vault remains open. Manual and automatic Refresh requests keep sharing one serialized queue. Overlapping requests for the same Custodian share both reconciliation work and the final market-data and Snapshot pass.

Remove the tray refresh line and all Auto-refresh timestamp and outcome state. The tray contains only Open Satella, Lock now, and Quit.

Add Settings > Sync log. The Vault stores one entry for every attempted Custodian refresh and every attempted Asset price check. Each entry shows when the attempt completed, the Asset or Custodian name, the action, and whether it succeeded or failed. A failed entry may include a short sanitized reason. The log retains thirty days and has no filters, export, or Clear action.

A valid Price observation succeeds regardless of age. Satella does not classify prices as fresh, stale, or delayed. When a source returns an observation older than the one already stored, Satella keeps the newer observation and records a successful price check. Explicit manual and automatic Refreshes still contact Market-data sources. Other callers may reuse a price fetched within five minutes, based on when Satella fetched it rather than the source's observation time.

The renderer does not poll or subscribe to Auto-refresh completion. Normal query refetch when the user navigates or returns to the window loads the latest Portfolio and Sync log.

Every completed Refresh persists one Snapshot. The dashboard graph may show only the latest Snapshot from each local calendar day, but it does not delete or overwrite intraday Snapshots.

## User Stories

1. As a returning user, I want Auto-refresh to start immediately after I unlock my Vault, so that my Portfolio is checked without a manual action.
2. As a user who leaves Satella running, I want Auto-refresh to repeat every fifteen minutes, so that Custodian data and prices continue to update.
3. As a user using Screen lock, I want Auto-refresh to continue while the Vault remains open, so that hiding the interface does not stop background work.
4. As a user who closes the desktop window, I want Auto-refresh to continue in the tray, so that the Portfolio keeps updating.
5. As a laptop user, I want Auto-refresh to respect sleep and resume its normal schedule without catch-up requests, so that Satella does not hammer external services after wake.
6. As a user with several synced Custodians, I want one Custodian failure not to stop the remaining Custodians, so that useful work still completes.
7. As a user with no synced Custodians, I want Auto-refresh to check relevant Asset prices and capture a Snapshot, so that a manual Portfolio still receives market data and history.
8. As a user pressing Refresh manually, I want the same reconciliation, price-check, and Snapshot behavior as Auto-refresh, so that both paths produce consistent results.
9. As a user pressing Refresh during an automatic cycle, I want duplicate Custodian work to coalesce, so that the Connector is not called twice.
10. As a user pressing Refresh during an automatic cycle, I want overlapping work to share one final market-data pass and Snapshot, so that Satella does not record duplicate completion work.
11. As a user clicking Refresh several times, I want pending requests for the same Custodian to coalesce atomically, so that a registration race cannot enqueue duplicates.
12. As a user with several synced Custodians, I want one market-data pass and one Snapshot after the completed automatic cycle, so that intermediate Custodian states do not create duplicate history.
13. As a user refreshing manually, I want one Snapshot for the completed Refresh, so that every Refresh contributes one historical observation.
14. As a user refreshing several times in one day, I want every completed Refresh retained as a Snapshot, so that storage preserves intraday history.
15. As a dashboard user, I want the graph to show the latest Snapshot from each local calendar day, so that intraday observations do not crowd the daily graph.
16. As a user opening the tray, I want only Open Satella, Lock now, and Quit, so that synchronization details do not clutter the tray.
17. As a user restarting Satella, I do not want a persisted last-refresh indicator, so that Satella does not maintain status state that the product no longer shows.
18. As a user opening Settings, I want a Sync log destination alongside existing Settings destinations, so that synchronization history has one predictable home.
19. As a user opening Sync log, I want the newest entries first, so that recent activity is visible immediately.
20. As a user with many entries, I want the page loaded in batches, so that thirty days of activity do not block the Settings page.
21. As a user with no Sync history, I want a simple empty state, so that the page does not look broken.
22. As a user whose Custodian refresh succeeds, I want one completed Custodian entry, so that the log records the attempt without duplicating its Accounts.
23. As a user whose Custodian refresh fails, I want one failed Custodian entry with a short reason, so that I can diagnose expired credentials or unavailable Connectors.
24. As a user whose automatic Custodian refresh fails, I want the failure recorded without a popup or notification, so that background work does not interrupt me.
25. As a user whose manual Custodian refresh fails, I want immediate feedback as well as the Sync-log entry, so that the action I am waiting for does not fail silently.
26. As a user whose Portfolio contains several Assets, I want one entry per attempted Asset price check, so that the log shows which Assets Satella checked.
27. As a user whose Market-data source returns a valid older quote, I want the price check recorded as successful, so that closed markets do not look broken.
28. As a user whose Market-data source returns the same observation again, I want the price check recorded as successful, so that an unchanged market is not an error.
29. As a user with a newer stored observation, I want an older response ignored without failure, so that delayed data cannot replace better data.
30. As a user whose Asset lacks a usable market-data identifier, I want a failed price-check entry with a sanitized reason, so that the missing update is explainable.
31. As a user whose price request encounters a network, rate-limit, server, missing-result, or invalid-response failure, I want a failed Asset entry, so that genuine failures remain diagnosable.
32. As a user checking a price repeatedly through non-Refresh operations, I want Satella to reuse a price fetched within five minutes, so that it avoids needless source requests.
33. As a user explicitly requesting Refresh, I want Satella to contact the relevant Market-data sources even when it fetched a price recently, so that Refresh means check now.
34. As a user viewing an Asset or Account, I do not want fresh, stale, or delayed labels, so that routine quote age does not become a warning.
35. As a user refreshing a Custodian, I do not want a delayed but valid quote counted as a price issue, so that manual Refresh does not show a false error toast.
36. As a user reviewing Sync log, I do not want prices, quantities, account numbers, credentials, source names, or raw responses in its entries, so that diagnostics do not expose financial or secret data.
37. As a user retaining a Vault for a long time, I want Sync-log entries older than thirty days removed automatically, so that the log remains bounded.
38. As a user viewing Positions or Portfolio history, I want log retention to have no effect on calculations, so that deleting diagnostics cannot change financial results.
39. As a user exporting and restoring my Vault, I want Sync log to travel with it, so that the restored Vault retains its recent diagnostic history.
40. As a user resetting my Vault, I want Sync log deleted with the Vault, so that no history from the old Vault remains.
41. As a user reviewing Sync log, I do not want a Clear button, filters, search, or export controls, so that the first version stays small.
42. As a user returning to an open window or navigating between pages, I want normal query refetch to load completed background changes, so that I eventually see the current Portfolio without recurring polling.
43. As a user leaving the window untouched, I accept that it may continue showing cached data until navigation or focus triggers a refetch, so that Satella does not add a polling loop or event protocol.
44. As a French-language user, I want the Settings destination, page, outcomes, actions, empty state, and failure copy in French, so that Sync log follows my App language.
45. As an English-language user, I want the same Sync-log interface in English, so that the new Settings page matches the rest of Satella.
46. As a user with a locked Vault, I want Sync log unavailable with the rest of my financial data, so that its Asset and Custodian names remain protected.
47. As a user whose automatic cycle encounters an unexpected defect, I want the scheduler to survive and later cycles to remain possible, so that one defect does not permanently stop Auto-refresh.
48. As a maintainer, I want production layer composition covered by a test, so that test-only service wiring cannot hide another unlock regression.
49. As a maintainer, I want existing Vaults upgraded without data loss, so that nightly and versioned users keep all persisted Portfolio data.

## Implementation Decisions

- ADR 0006 remains in force. Scheduling stays inside the engine, runs immediately on Vault unlock, repeats every fifteen minutes, continues through Screen lock, and performs no catch-up burst after sleep.
- ADR 0007 remains in force. Manual and automatic Refresh use one engine queue with strict FIFO execution and per-Custodian coalescing.
- Production composition must provide one shared Vault-unlock signal to the Vault and Auto-refresh scheduler. The production-shaped test composition must match the running engine rather than reconstructing a friendlier graph for tests.
- The scheduler must survive an unexpected cycle defect. Genuine Custodian and price-check failures remain ordinary data returned by the cycle and recorded in Sync log.
- Queue registration must make the lookup and insertion of pending work one atomic operation. Two simultaneous submissions for the same key must receive the same result and enqueue one job.
- A manual Refresh that overlaps an automatic cycle for the same Custodian joins the existing Custodian work and shared completion pass. It does not schedule a second market-data pass or Snapshot.
- An automatic cycle reconciles every synced Custodian in order, then runs one price pass and captures one Snapshot. A Custodian failure does not stop later Custodians or the shared completion pass.
- Every completed manual or automatic Refresh captures one Snapshot. Dashboard day selection is a read concern based on the user's local calendar, not a Snapshot retention rule.
- Add one immutable timestamped migration for the Sync-log table. The migration must preserve all existing Vault data, be registered in timestamp order, and be sealed after its schema is final.
- Sync log is stored inside the Vault. Vault export and restore include it, Vault reset removes it, and locked-Vault finance access rules protect it.
- A Sync-log row has an internal identifier, completion timestamp, subject kind, subject name captured at completion, action, outcome, and optional sanitized failure reason. Subject kinds are Asset and Custodian. Outcomes are success and failure.
- The public list contract returns only the fields required by the page. It does not expose prices, quantities, account numbers, credentials, Connector IDs, Market-data source names, raw provider messages, or raw responses.
- The Sync-log service writes one terminal entry per attempt. It does not write separate started and completed entries.
- A Custodian Refresh produces one Custodian entry even when the Connector reconciles several Accounts. Satella does not create Account or Connector entries.
- A price pass produces one Asset entry per selected Asset, including when a shared provider batch handles several Assets. Missing lookup information produces a failed Asset entry because Satella selected the Asset for a price check but could not issue the source request.
- Successful valid Price observations produce successful Asset entries even when their observation time is old or unchanged.
- A valid observation replaces the stored price only when it is at least as recent as the stored observation. An older valid response remains a successful check and leaves the newer stored observation intact.
- Remove `isStale`, `hasStalePrices`, and the derived stale-price calculation from engine contracts, read models, frontend fixtures, and in-memory adapters. Do not replace them with delayed or freshness fields.
- Keep the source observation timestamp and Satella's update timestamp. The observation timestamp describes the Price observation. The update timestamp supports request throttling and internal traceability.
- Non-Refresh callers may skip a source request when Satella fetched the price within five minutes. Explicit manual and automatic Refresh passes bypass that throttle. Skipped cached reads are not Sync attempts and do not create log entries.
- Genuine price failures remain network, rate-limit, server, missing-result, invalid-response, and missing-lookup cases. A valid older or unchanged observation is not a failure.
- Background failures appear only in Sync log. Direct manual Refresh failures also keep immediate user feedback.
- Delete Sync-log rows older than thirty days as part of normal log writes. Retention uses completion timestamps and an injected clock in tests. The page has no manual deletion operation.
- Expose a Vault-protected, newest-first paginated Sync-log read through the existing finance API and frontend engine interface. Pagination ordering must be stable when entries share a completion timestamp.
- Add a Settings destination and nested Sync-log page using the existing Settings navigation pattern. The page uses the App language and the project's Chakra UI v3 conventions.
- The page shows compact rows with completion time, subject name, action, outcome, and sanitized failure reason when present. It has an empty state and batch loading. It has no filters, search, export, source metadata, price metadata, or Clear action.
- Remove the tray's last-refresh row and formatter. The native menu contains Open Satella, Lock now, and Quit in the App language.
- Remove Auto-refresh timestamp and outcome contracts, the refresh-status HTTP endpoint, desktop refresh-status projection, and managed-process fields used only for that status. Keep managed Vault-state messages required by Lock now and Screen lock.
- Remove the plaintext refresh-failure log, its service, filesystem configuration, rotation logic, and tests. Sync log becomes the only synchronization history.
- Do not add polling, server-sent events, WebSockets, or renderer notifications for cycle completion. Existing query behavior must refetch stale finance data when routes mount, the user navigates, or the window regains focus.
- Regenerate route and API artifacts through the repository's normal generators when their source contracts change.
- Update the existing Auto-refresh, tray-runtime, dashboard, and glossary documents as part of this effort. Those documents already contain the settled language and must remain consistent with the implementation.

## Testing Decisions

Good tests assert behavior through a caller-owned boundary. They should not inspect queue maps, internal refs, SQL helper calls, React component state, timer handles, or Electron object internals.

- Use the engine finance service as the main seam. Run it with a real temporary Vault database, a test clock, fake Connector adapters, and recording Market-data source adapters. Exercise manual and automatic Refresh through public services, then observe Custodians, prices, Snapshots, and Sync-log reads.
- Add a production-shaped engine composition test that opens a real test Vault and proves the shared unlock event starts one immediate automatic cycle. This test must use the same layer assembly exported for production startup.
- Extend the existing Auto-refresh test-clock coverage for the fifteen-minute cadence, Screen lock continuation, Vault close and reopen, one completion pass, failure isolation, and scheduler survival after an unexpected defect.
- Extend the serialized Refresh queue suite with simultaneous submissions that hit the pending-registration boundary. Assert one Connector call, one shared result, one price pass, and one Snapshot for overlapping manual and automatic work.
- Extend Custodian refresh service tests to assert one successful or failed Custodian Sync-log entry per attempt, including a Connector that returns several Accounts.
- Extend market-data coordinator tests with valid old, valid unchanged, newer, and older-than-stored observations. Assert that valid observations never create failures or stale metadata and that an older observation does not replace a newer stored price.
- Test genuine market-data failures at the engine service seam. Each selected Asset receives one failed entry with a sanitized reason, including missing lookup, missing result, invalid response, network, rate-limit, and server cases.
- Test batched source requests with several Assets. The external source may receive one batch, but Sync log must contain one terminal entry per Asset.
- Test five-minute request reuse against Satella's update timestamp. A non-Refresh caller may reuse a recent fetch, while explicit manual and automatic Refreshes call the source regardless of observation age.
- Test thirty-day retention with a test clock. A normal write removes expired entries, keeps entries inside the boundary, and cannot change Positions, current prices, or Snapshots.
- Extend the migration suite for both a fresh Vault and an upgrade from the last released schema. Assert the new table exists, existing Vault data remains, and migration history stays ordered and sealed.
- Test the Sync-log API through the finance API seam. Cover Vault access control, newest-first stable pagination, empty results, field decoding, and rejection of data outside the closed public contract.
- Test the frontend query adapter with the existing in-memory and HTTP engine contract suites. Verify page loading, paging, engine failures, and normal query refetch after navigation or focus. Assert that no recurring polling option is configured.
- Test the Settings route through the existing route harness. Cover navigation from Settings, breadcrumbs, empty state, successful and failed rows, batch loading, long names and reasons, English and French copy, narrow layout, and accessible status text.
- Test manual Refresh feedback through the existing Refresh-button seam. A genuine failure still produces immediate feedback. A valid old or unchanged Price observation produces success and no price-issue toast.
- Test the desktop tray through the existing projection adapter. Assert exactly three localized items, correct Open, Lock now, and Quit actions, and no refresh timestamp or outcome text.
- Test the managed process message decoder after status removal. It accepts the closed Vault-state payload and rejects removed Auto-refresh fields and financial data.
- Delete or invert tests that require Auto-refresh status, stale-price flags, the external failure-log file, or one stored Snapshot per day.
- Run the full repository completion check after sealing the migration. Fix every failure before completion.

## Out of Scope

- A configurable Auto-refresh interval.
- Catch-up cycles after system sleep.
- Concurrent Custodian reconciliation.
- New Connectors or Market-data sources.
- Changes to provider retry counts, timeouts, or batching beyond per-Asset log recording.
- Fresh, stale, delayed, market-open, or market-closed price states.
- Market-data source names, quote times, or prices in Sync log.
- Account-level or Connector-level Sync-log entries.
- Logging manual Asset prices or other manual edits as Sync attempts.
- Sync-log filtering, search, export, manual clearing, or configurable retention.
- System notifications or background-failure popups.
- A tray refresh time, status badge, warning icon, or Refresh now action.
- Polling or a push protocol for renderer updates.
- Persisting Auto-refresh timestamps or outcomes across restarts.
- Using Sync log to compute Positions, prices, Portfolio value, or history.
- Deleting intraday Snapshots or adding a 1D dashboard range.
- Recovering or importing entries from the removed plaintext failure log.
- Windows or Linux tray work.

## Further Notes

The Sync log and Price observation terms are defined in the project glossary. Use Custodian for the financial institution instance and Connector only for its technical integration. A Custodian Refresh may reconcile several Accounts but produces one Custodian log entry.

ADR 0006 and ADR 0007 remain accepted. This work repairs their implementation rather than reopening their scheduler location or queue decisions.

The current production composition can construct separate Vault-unlock signal instances, and optional managed-runtime acquisition can miss the managed adapter. The current queue also separates pending lookup from insertion, leaving a duplicate-registration race. These are observed defects, not new product decisions.

The migration lineage is permanent. Create the migration with the actual UTC creation time only when implementation begins. Do not modify sealed migrations. Run the migration seal command once the new file is final, then test both a fresh Vault and an upgrade from the last released schema.
