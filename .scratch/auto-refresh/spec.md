# Spec: Auto-refresh

Status: ready-for-agent

## Problem Statement

Satella's portfolio data is only as current as the last time the user thought to press Refresh. A user who opens the app after a day away sees prices that have not been checked and Custodian data that has not been refreshed, and must manually refresh each synced Custodian to catch up. Data silently ages whenever the app is not in active use, which makes the product feel dead exactly when it should feel alive at the moment of return.

## Solution

The engine repeats a refresh cycle automatically while the vault is unlocked: immediately on unlock, then checking every fifteen minutes. Each cycle refreshes every synced custodian that is due according to its Connector's cadence, updates market-data prices for all assets, and captures a snapshot, so portfolio value history stays current without any user action. The app gains a macOS tray presence so it keeps running and refreshing with its window closed; the tray shows the time of the last cycle and offers Lock now and Quit.

Success is silent. Settings contains a Sync log with one entry for every Asset price check and Custodian refresh. Background failures never interrupt or nag.

## User Stories

1. As a returning user, I want my portfolio refreshed automatically when I unlock the vault, so that I never look at stale data.
2. As a user who leaves Satella running, I want holdings refreshed at each Connector's safe cadence and prices checked every fifteen minutes, so that my dashboard stays current without hammering custodians.
3. As a user working in another app, I want auto-refresh to continue while the Screen lock hides the interface, so that privacy mode does not cost me freshness.
4. As a laptop user, I want auto-refresh to respect system sleep, so that Satella never keeps my machine awake.
5. As a laptop user waking my machine, I want refreshes to resume on the normal schedule without a burst of catch-up cycles, so that connectors are not hammered after sleep.
6. As a user closing the window, I want Satella to keep running in the tray and keep refreshing, so that closing the window does not stop background work.
7. As a user with the window closed, I want a tray icon whose left-click reopens the window, so that I can get back to my portfolio in one gesture.
8. As a security-conscious user, I want a "Lock now" item in the tray menu, so that I can hide my finances without opening the app.
9. As a user diagnosing synchronization, I want Settings to show one entry for every Asset price check and Custodian refresh, so that one log explains what Auto-refresh did.
10. As a user done for the day, I want a Quit item in the tray menu, so that I can fully stop Satella from anywhere.
11. As a user pressing Refresh manually, I want my manual refresh to take effect through the same pipeline as auto-refresh, so that behavior is identical wherever I trigger it.
12. As an impatient user clicking Refresh repeatedly, I want duplicate pending refreshes of the same custodian to coalesce, so that I never trigger redundant syncs.
13. As a user refreshing manually mid-cycle, I want my job handled in order by one worker, so that connectors are never hit concurrently from two paths.
14. As a user tracking net worth over time, I want a snapshot captured on every successful refresh, so that my history has intraday granularity.
15. As a user who refreshes manually several times a day, I want each successful refresh to add its own snapshot, so that my history reflects real activity rather than a daily sample.
16. As a user whose Connector credentials have expired, I want the background failure written to Sync log rather than shown as a popup, so that background failures do not interrupt me.
17. As a diagnosing user, I want each Sync-log entry to show its completion time, Asset or Custodian name, action, outcome, and a short sanitized failure reason when applicable.
18. As a privacy-conscious user, I want Sync log to contain no prices, quantities, account numbers, credentials, Market-data source names, or raw responses.
19. As a user inspecting storage, I want Sync-log entries deleted after thirty days, so that diagnostics stay bounded and never affect Portfolio calculations.
20. As a developer running the web app standalone, I want auto-refresh to behave identically to the packaged desktop, so that there is one code path to reason about.
21. As a user quitting the app mid-cycle, I want the engine to shut down cleanly, so that an interrupted refresh never corrupts vault data.
22. As a user with multiple synced custodians, I want a failure in one custodian not to prevent the others from refreshing, so that one broken credential cannot stall the whole portfolio.

## Implementation Decisions

- The scheduler lives **inside the engine**, calling refresh services internally — no self-issued HTTP requests and no traversal of the renderer finance-access middleware (recorded in ADR 0006). Auto-refresh therefore runs identically in the packaged desktop and in development/web runtimes.
- The engine checks due work every fifteen minutes. Each Connector declares its automatic cadence, defaulting to fifteen minutes. Manual Refresh bypasses that cadence. No special catch-up logic runs after machine wake.
- A **cycle** = sequential refresh of every synced custodian → price refresh across all assets → snapshot capture. Custodian failures are isolated; the cycle continues with remaining custodians.
- Automatic cycles reserve all Custodian queue keys before the first queued reconciliation starts, so a manual Refresh cannot slip into an unclaimed later Custodian. If an unexpected defect interrupts a cycle before its shared completion pass, the completion group is released and the scheduler remains usable for the next cycle.
- Auto-refresh continues during the **Screen lock** (vault unlocked) and stops when the machine sleeps, the vault closes, or the app quits.
- **All refreshes flow through one serialized queue** owned by the engine (ADR 0007): strict FIFO, single worker, coalescing so at most one pending job exists per custodian. Manual refreshes submit to the same queue as automatic ones. Price refresh remains single-flight within the cycle.
- The existing **daily snapshot-interval gating is removed**: every successful refresh captures a snapshot, including manual ones.
- The Vault stores a **Sync log** entry after every Asset price-check attempt and Custodian-refresh attempt, whether it succeeds or fails. An entry contains its completion time, subject kind, subject name, action, outcome, and an optional sanitized failure reason. It contains no financial values, source identity, credentials, or raw response. Entries older than thirty days are deleted automatically. Vault export, restore, and reset carry or remove the log with the rest of the Vault.
- A valid Price observation is a successful price check regardless of age. Satella records no fresh, stale, or delayed classification. An older observation does not replace a newer stored observation. Request throttling uses the time Satella last fetched a price, not the observation time.
- The desktop shell changes to **close-to-tray unconditionally**: closing the window hides it and keeps the app running; Quit exists only in the tray menu. Tray icon is a monochrome template asset; left-click opens/focuses the window; menu contains Open, Lock now, and Quit.
- The engine exposes no Auto-refresh timestamp or outcome status. The renderer does not poll or subscribe for cycle completion; normal query refetch when the user navigates or returns to the window loads the latest Vault state.

## Testing Decisions

Good tests assert external behavior only — what a caller observes — never internal timers, queue bookkeeping, or module structure.

**Engine service seam** (existing): `it.effect` tests against the finance service layer with a test clock and the connector HTTP transport fakes. Prior art: the custodian service tests, the portfolio service tests, and the per-connector transport-seamed suites. Covers:

- immediate cycle on unlock, subsequent scheduler ticks, and Connector-specific due checks;
- serialization and per-custodian coalescing when manual and automatic refreshes race;
- snapshot captured on every successful refresh (the former daily-gating test is inverted here);
- one Vault-backed Sync-log entry per attempted Asset price check and Custodian refresh, including sanitized genuine failures and valid older Price observations as successes;
- removal of fresh, stale, and delayed fields from finance contracts and read models;
- one custodian's failure not blocking the others in a cycle.
- an unexpected cycle defect releasing shared completion state and allowing a later scheduled cycle to run.

**Desktop main-process helper seam** (existing): prior art is the desktop helper tests. Covers close-to-tray window-lifecycle semantics and the tray-menu actions mapping to their engine calls. The tray icon visual itself is untested.

## Out of Scope

- User-configurable refresh intervals. Cadence is declared by each Connector until real demand justifies a user setting.
- System notifications for refresh success or failure.
- Failure state surfaced in the tray (badge, warning icon) — logs only for now.
- A tray "Refresh now" item.
- Refresh scheduling for manual custodians (they have nothing to sync; their cash FX rides along with the price step already).
- Windows/Linux tray behavior — macOS first, matching the packaging story.

## Further Notes

Glossary terms added during design: **Price observation**, **Sync**, **Sync log**, **Auto-refresh**, and **Snapshot** (CONTEXT.md). Related decisions recorded in `docs/adr/0006-auto-refresh-lives-in-the-engine.md` and `docs/adr/0007-serialized-refresh-queue.md`. Every completed Refresh captures one Snapshot, while the dashboard graph may select one Snapshot per displayed day.
