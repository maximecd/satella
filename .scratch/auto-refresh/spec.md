# Spec: Auto-refresh

Status: ready-for-agent

## Problem Statement

Satella's portfolio data is only as fresh as the last time the user thought to press Refresh. A user who opens the app after a day away sees stale prices and stale custodian holdings, and must manually refresh each synced custodian to catch up. Data silently ages whenever the app is not in active use, which makes the product feel dead exactly when it should feel alive — at the moment of return.

## Solution

The engine repeats a full refresh cycle automatically while the vault is unlocked: immediately on unlock, then every fifteen minutes. Each cycle refreshes every synced custodian sequentially, updates market-data prices for all assets, and captures a snapshot, so portfolio value history stays current without any user action. The app gains a macOS tray presence so it keeps running — and refreshing — with its window closed; the tray shows the time of the last cycle and offers Lock now and Quit.

Success is silent. Failures never interrupt or nag: they are recorded to an operational log file outside the vault.

## User Stories

1. As a returning user, I want my portfolio refreshed automatically when I unlock the vault, so that I never look at stale data.
2. As a user who leaves Satella running, I want holdings and prices refreshed every fifteen minutes, so that my dashboard is always current without my intervention.
3. As a user working in another app, I want auto-refresh to continue while the Screen lock hides the interface, so that privacy mode does not cost me freshness.
4. As a laptop user, I want auto-refresh to respect system sleep, so that Satella never keeps my machine awake.
5. As a laptop user waking my machine, I want refreshes to resume on the normal schedule without a burst of catch-up cycles, so that connectors are not hammered after sleep.
6. As a user closing the window, I want Satella to keep running in the tray and keep refreshing, so that closing the window does not stop background work.
7. As a user with the window closed, I want a tray icon whose left-click reopens the window, so that I can get back to my portfolio in one gesture.
8. As a security-conscious user, I want a "Lock now" item in the tray menu, so that I can hide my finances without opening the app.
9. As a user stepping away, I want the tray menu to show the time of the last completed refresh, so that I can trust the data at a glance.
10. As a user done for the day, I want a Quit item in the tray menu, so that I can fully stop Satella from anywhere.
11. As a user pressing Refresh manually, I want my manual refresh to take effect through the same pipeline as auto-refresh, so that behavior is identical wherever I trigger it.
12. As an impatient user clicking Refresh repeatedly, I want duplicate pending refreshes of the same custodian to coalesce, so that I never trigger redundant syncs.
13. As a user refreshing manually mid-cycle, I want my job handled in order by one worker, so that connectors are never hit concurrently from two paths.
14. As a user tracking net worth over time, I want a snapshot captured on every successful refresh, so that my history has intraday granularity.
15. As a user who refreshes manually several times a day, I want each successful refresh to add its own snapshot, so that my history reflects real activity rather than a daily sample.
16. As a user whose connector credentials have expired, I want the failure written to a log rather than shown as a popup, so that background failures do not interrupt me.
17. As a diagnosing user, I want failed refreshes logged with timestamp, custodian, error code, and message, so that I can understand what went wrong without reproducing it.
18. As a privacy-conscious user, I want the failure log to contain no balances, account numbers, or credentials, so that operational diagnostics never leak financial data.
19. As a user inspecting storage, I want the log rotated instead of growing forever, so that diagnostics stay bounded.
20. As a developer running the web app standalone, I want auto-refresh to behave identically to the packaged desktop, so that there is one code path to reason about.
21. As a user quitting the app mid-cycle, I want the engine to shut down cleanly, so that an interrupted refresh never corrupts vault data.
22. As a user with multiple synced custodians, I want a failure in one custodian not to prevent the others from refreshing, so that one broken credential cannot stall the whole portfolio.

## Implementation Decisions

- The scheduler lives **inside the engine**, calling refresh services internally — no self-issued HTTP requests and no traversal of the renderer finance-access middleware (recorded in ADR 0006). Auto-refresh therefore runs identically in the packaged desktop and in development/web runtimes.
- Cadence is **fixed**: one cycle immediately on vault unlock, then every fifteen minutes via the engine's standard scheduling primitive. No special catch-up logic after machine wake; the schedule's natural behavior governs.
- A **cycle** = sequential refresh of every synced custodian → price refresh across all assets → snapshot capture. Custodian failures are isolated; the cycle continues with remaining custodians.
- Auto-refresh continues during the **Screen lock** (vault unlocked) and stops when the machine sleeps, the vault closes, or the app quits.
- **All refreshes flow through one serialized queue** owned by the engine (ADR 0007): strict FIFO, single worker, coalescing so at most one pending job exists per custodian. Manual refreshes submit to the same queue as automatic ones. Price refresh remains single-flight within the cycle.
- The existing **daily snapshot-interval gating is removed**: every successful refresh captures a snapshot, including manual ones.
- Failed refreshes append structured entries (`timestamp`, `custodian`, `error code`, `message`) to a **plaintext log outside the vault**. In the packaged desktop the directory comes from Electron's standard logs path, passed to the engine alongside its other launch configuration; development falls back to the worktree data directory. Entries carry no financial data or credentials. The file rotates at roughly 1 MB.
- The desktop shell changes to **close-to-tray unconditionally**: closing the window hides it and keeps the app running; Quit exists only in the tray menu. Tray icon is a monochrome template asset; left-click opens/focuses the window; menu contains Open, Lock now, last-refresh time, Quit.
- The engine exposes minimal scheduler status (last cycle timestamp and outcome) through its existing status surface so the desktop can render the tray line; this payload carries no financial data.

## Testing Decisions

Good tests assert external behavior only — what a caller observes — never internal timers, queue bookkeeping, or module structure.

**Engine service seam** (existing): `it.effect` tests against the finance service layer with a test clock and the connector HTTP transport fakes. Prior art: the custodian service tests, the portfolio service tests, and the per-connector transport-seamed suites. Covers:

- immediate cycle on unlock and subsequent ticks at the fixed interval;
- serialization and per-custodian coalescing when manual and automatic refreshes race;
- snapshot captured on every successful refresh (the former daily-gating test is inverted here);
- failure-log entry written, with injected filesystem, on a failed refresh;
- one custodian's failure not blocking the others in a cycle.

**Desktop main-process helper seam** (existing): prior art is the desktop helper tests. Covers close-to-tray window-lifecycle semantics and the tray-menu actions mapping to their engine calls. The tray icon visual itself is untested.

## Out of Scope

- Configurable refresh interval (fixed fifteen minutes until real demand).
- System notifications for refresh success or failure.
- Failure state surfaced in the tray (badge, warning icon) — logs only for now.
- A tray "Refresh now" item.
- Refresh scheduling for manual custodians (they have nothing to sync; their cash FX rides along with the price step already).
- Windows/Linux tray behavior — macOS first, matching the packaging story.

## Further Notes

Glossary terms added during design: **Auto-refresh** and **Snapshot** (CONTEXT.md). Related decisions recorded in `docs/adr/0006-auto-refresh-lives-in-the-engine.md` and `docs/adr/0007-serialized-refresh-queue.md`. Two existing behaviors change contract: the daily snapshot-interval policy (and its test) disappears, and closing the desktop window no longer quits the application.
