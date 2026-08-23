# Spec: Low-overhead tray runtime

Status: ready-for-agent

## Problem Statement

Satella remains useful in the macOS tray because Auto-refresh keeps the Portfolio current while the window is closed. The current runtime does more work and retains more memory than that behavior requires.

An automatic Refresh cycle with N synced Custodians currently performs N complete Custodian refreshes, each including market-data work and a Snapshot, then performs another market-data pass and Snapshot at the end of the cycle. This produces N+1 market-data passes and N+1 Snapshots where ADR 0007 and the existing Auto-refresh specification require one of each per completed cycle.

The managed engine also wakes once per second to inspect its parent process. The tray makes two HTTP requests every minute and rebuilds its menu even when nothing changed. One request omits the engine token, so the engine rejects it and the last-refresh line never receives valid status through that path. Closing the window hides the full renderer rather than giving it a dormant lifecycle, which retains the React tree, query cache, charts, Chakra system, and browser document. Screen-lock inactivity uses a fifteen-second polling timer while the Vault is open. Connector and Market-data source implementations load eagerly, and the market-data search cache has no capacity limit.

No baseline benchmark exists yet. Some costs are certain from control flow, while their effect on CPU and resident memory remains unmeasured. Satella needs to remove the confirmed repeated work, establish a repeatable baseline, and prove that the packaged app uses less CPU and memory in its tray-idle state without making normal use feel sluggish.

## Solution

Satella will deepen five runtime modules around the confirmed seams.

The Refresh-cycle module will reconcile every synced Custodian through the serialized queue, then perform one market-data pass and capture one Snapshot for the completed automatic cycle. Manual Refresh keeps its complete user-visible behavior.

The managed-runtime lifecycle module will replace the engine's one-second parent check with a blocking process channel owned by Electron. The same private channel will carry small operational state changes needed by the tray. The tray state module will consume those events, maintain one current projection, and rebuild the native menu only when its visible state changes.

The window lifecycle module will distinguish active, hidden, and dormant states. A short grace period will preserve fast reopen after an accidental close. Once the grace period ends, Satella will release the renderer and recreate it on demand. The Vault module will own the Screen-lock inactivity deadline so the configured timeout still works when no renderer exists. It will use one cancellable deadline rather than a fifteen-second polling loop.

Connector and Market-data source modules will keep catalog metadata cheap, load execution adapters when work first needs them, and bound the market-data search cache. The implementation will measure the packaged process tree before and after these changes and record CPU, resident memory, automatic-cycle work counts, and tray reopen latency.

## User Stories

1. As a user with one synced Custodian, I want each automatic Refresh cycle to update market data once, so that Satella does not repeat external work in the tray.
2. As a user with several synced Custodians, I want market-data work to remain once per completed cycle, so that background cost does not grow unnecessarily with each Custodian.
3. As a user with several synced Custodians, I want one Snapshot captured after the cycle, so that Portfolio history records the completed state rather than intermediate Custodian states.
4. As a user whose first Custodian fails to refresh, I want the remaining Custodians to continue, so that one failure does not prevent useful updates.
5. As a user whose Custodian refresh partially fails, I want the cycle to finish its market-data and Snapshot work once, so that successful updates still reach the Portfolio.
6. As a user pressing Refresh manually, I want the current complete Refresh behavior to remain, so that the performance work does not remove expected results.
7. As a user pressing Refresh while Auto-refresh is running, I want both paths to share the serialized queue, so that Satella still avoids concurrent duplicate Custodian work.
8. As a user clicking Refresh repeatedly, I want pending work for the same Custodian to coalesce, so that the optimization preserves ADR 0007.
9. As a user leaving Satella in the tray, I want the engine to block while no work is due, so that it does not wake every second to check Electron.
10. As a user whose Electron process exits unexpectedly, I want the managed engine to notice through the process channel, release Vault ownership, and exit, so that no orphan process retains my Vault.
11. As a user quitting Satella normally, I want the engine to shut down cleanly, so that removing parent polling does not weaken cleanup.
12. As a user running the web and engine development runtime without Electron, I want the engine to operate without a managed parent channel, so that development remains supported.
13. As a tray user, I want the last completed Auto-refresh time to be accurate, so that I can judge Portfolio freshness without opening the window.
14. As a tray user, I want the Lock action to reflect the current Vault and Screen-lock state, so that the menu never offers a stale action.
15. As a tray user, I want menu text to follow the App language, so that the event-driven tray preserves current localization.
16. As a tray user, I want the menu rebuilt only when visible state changes, so that idle Satella does no native menu allocation on a fixed schedule.
17. As a tray user, I want operational status delivered through Satella's private managed process relationship, so that tray state does not depend on unauthenticated HTTP polling.
18. As a user whose engine is busy, I want tray state updates to coalesce to the latest value, so that old updates never pile up in memory.
19. As a user closing the window briefly, I want it to reopen immediately during the grace period, so that an accidental close does not feel like a cold launch.
20. As a user leaving the window closed, I want the renderer to become dormant after the grace period, so that the tray app releases memory it no longer needs.
21. As a user reopening Satella after it became dormant, I want the window recreated and focused automatically, so that dormancy requires no extra action.
22. As a user reopening Satella, I want the current Vault and Screen-lock state loaded from the engine, so that destroying the previous renderer never restores stale private data.
23. As a user with a configured Screen-lock timeout, I want the same timeout honored while the window is hidden or dormant, so that lower memory use does not change my privacy setting.
24. As a user interacting with the open window, I want activity to reset one Screen-lock deadline, so that Satella locks only after the configured period of inactivity.
25. As a user interacting frequently, I want activity reports coalesced, so that pointer and keyboard input do not create high-frequency engine traffic.
26. As a user whose Screen lock activates while the renderer is dormant, I want Auto-refresh to continue, so that privacy and Portfolio freshness keep their established relationship.
27. As a user whose machine sleeps, I want Satella to preserve its existing no-catch-up scheduling behavior, so that performance work does not cause a burst of Refresh work after wake.
28. As a user with no synced Custodians, I want idle Satella to avoid loading unused Connector execution adapters, so that baseline memory reflects the features I use.
29. As a user linked only to one Connector, I want unused Connector implementations to remain unloaded, so that adding built-in integrations does not raise every user's idle memory.
30. As a user whose Portfolio needs one Market-data source, I want unused Market-data source adapters to remain unloaded until needed, so that startup work stays proportional to my Portfolio.
31. As a user searching for many different Assets over a long session, I want old search results evicted, so that the engine cannot retain an unbounded cache.
32. As a user closing the Vault, I want Vault-scoped external resources released, so that a locked Vault does not retain resources needed only for financial work.
33. As a user opening Satella, I want adapter loading to happen only when required and without changing visible Connector capabilities, so that lower baseline memory does not remove choices from the interface.
34. As a user refreshing a Custodian, I want lazy adapter loading failures reported through existing Refresh failure behavior, so that a loading problem does not crash the engine.
35. As a user, I want tray reopen latency measured before and after renderer dormancy, so that memory savings do not silently make Satella feel slow.
36. As a user, I want packaged tray-idle CPU and resident memory measured before and after the work, so that performance claims rest on numbers rather than code shape.
37. As a developer, I want automatic-cycle behavior verified through one high Refresh-cycle seam, so that tests catch repeated market-data and Snapshot work without inspecting internal functions.
38. As a developer, I want managed process behavior verified through one lifecycle seam, so that parent loss and cleanup can change implementation without rewriting callers.
39. As a developer, I want tray behavior verified through one state-projection seam, so that authentication, coalescing, localization, and menu deduplication stay together.
40. As a developer, I want active, hidden, and dormant transitions verified through one window lifecycle seam, so that renderer policy remains understandable and reversible.
41. As a developer, I want external adapter acquisition and cache policy verified through their existing real seams, so that tests do not import provider implementations directly.
42. As a maintainer, I want before-and-after measurements recorded with the spec, so that later architecture reviews can distinguish completed savings from remaining hypotheses.

## Implementation Decisions

- The work deepens five modules: Refresh cycle, managed runtime lifecycle, tray state, window lifecycle, and external data resources. Each module has one interface used by both callers and tests.
- ADR 0004 remains in force. The packaged desktop owns one private engine, one production Vault location, and the engine token. The lifecycle implementation changes from PID polling to a blocking operating-system process channel.
- ADR 0006 remains in force. Auto-refresh scheduling stays inside the engine, continues during the Screen lock, and performs no special catch-up after machine sleep.
- ADR 0007 remains in force. Manual and automatic Refresh jobs still use one serialized FIFO queue with per-Custodian coalescing. The queue worker already blocks while idle and will not be replaced.
- The Refresh-cycle module will distinguish internal Custodian reconciliation from completion of an automatic cycle. Automatic cycles reconcile each synced Custodian in order, collect failures, then run exactly one market-data pass and capture exactly one Snapshot.
- A manual Custodian Refresh remains complete from the user's perspective. It reconciles the Custodian, updates market data, captures a Snapshot, and returns the refreshed Custodian with market-data failures.
- Automatic-cycle status changes only after the cycle's single completion step finishes. Its timestamp and outcome continue to contain no financial data.
- The repeated N+1 behavior is a correctness defect against ADR 0007, not an optional performance experiment. The implementation must correct it even if local CPU measurements show a small change on an empty Portfolio.
- The desktop will launch the managed engine with a private bidirectional process channel. Closing that channel signals parent loss. The engine will block on the channel rather than inspect its parent PID on a timer.
- Database ownership cleanup will remain part of managed engine finalization. Normal shutdown, parent loss, startup failure, and forced termination will share the managed-runtime lifecycle module rather than duplicate cleanup rules.
- Standalone development uses a separate runtime adapter with no managed parent. Two runtime adapters make the lifecycle seam real.
- The managed process channel may carry only operational messages required by lifecycle and tray state. It must not carry Portfolio values, Accounts, Positions, credentials, or other Vault financial data.
- The engine will publish changes to Auto-refresh status and Vault operational state over the managed process channel. The desktop will not poll the engine once per minute for tray state.
- The tray state module will own the latest operational state, App language, menu projection, and Electron tray lifetime. It will replace the native menu only when the projected labels or enabled actions change.
- Removing recurring tray HTTP acquisition also removes the current unauthenticated refresh-status request. Existing HTTP token requirements remain unchanged for all non-public routes.
- Operational events will use latest-value semantics. A slow desktop consumer may skip intermediate duplicate states but must receive the newest state without an unbounded queue.
- The window lifecycle has three states: active, hidden during a 60-second grace period, and dormant after the grace period. Reopening during the grace period cancels dormancy and focuses the existing window.
- Entering dormancy destroys the BrowserWindow and its web document while keeping Electron main, the engine, and the tray alive. Reopening from dormancy creates a fresh BrowserWindow and reads current state from the engine.
- The 60-second grace period is an internal policy, not a user setting. Before-and-after reopen measurements may justify changing it in a later decision, but this implementation will use one fixed value.
- The Vault module will own the Screen-lock inactivity deadline. The renderer will report user activity through a coalesced path, and the engine will maintain one cancellable deadline timer based on the configured Screen-lock timeout.
- Activity reporting will send at most one update per thirty seconds while the window is active. The final activity time must remain accurate enough that Screen lock never occurs earlier than the configured timeout.
- Hiding or destroying the renderer does not cancel the Screen-lock deadline. When the deadline expires, the Vault enters Screen lock and Auto-refresh continues as it does today.
- The Connector catalog will separate cheap capability metadata from executable adapters. Catalog display must not require loading every Connector implementation.
- Connector execution adapters will load on first use and remain behind the existing Connector seam. The engine will surface adapter-loading failures as normal Connector Refresh failures.
- Market-data source adapters and SDK clients will be created on first use behind the existing Market-data source seam. The module will own their lifetime rather than process-global construction owning it implicitly.
- The market-data search cache will keep the existing sixty-second freshness period, cap itself at one hundred query entries, remove expired entries during access, and evict the least recently used entry when full.
- Closing the Vault will clear Vault-scoped search results and release external resources that are not required while locked. The Screen lock does not release them because Auto-refresh continues.
- No database schema change or migration is required.
- Performance verification will use a packaged macOS build. It will record the whole process tree, including Electron main, renderer, and engine, rather than quote one process in isolation.
- The baseline and result will use the same seeded Vault scenarios: no synced Custodian, one synced Custodian, and three synced Custodians. Measurements will cover active idle, tray hidden during grace, tray dormant, one automatic cycle, warm reopen, and dormant reopen.
- The measurement record will include sampled CPU, resident memory, engine wakeup mechanisms, market-data call count, Snapshot count, warm reopen time, and dormant reopen time. Each timing and resource value will use the median of at least five runs on the same machine.
- Completion requires lower median sampled CPU during tray dormancy, lower whole-tree resident memory during tray dormancy, zero recurring parent and tray polling, one market-data pass and one Snapshot per automatic cycle, and no functional regression in Refresh, Screen lock, tray actions, or Vault ownership.
- The repository's normal completion rule still applies. `pnpm check` must pass before implementation is reported complete.

## Testing Decisions

Good tests cross the same interface as production callers and assert external behavior. They do not inspect queue maps, timer handles, private helper calls, dynamic import syntax, or the internal shape of Electron objects. Test clocks, fake adapters, and recorded effects are acceptable when they let a test observe time and side effects through the module interface.

- Test the Refresh-cycle module at the existing engine finance seam with a test clock, three fake Custodian adapters, a recording Market-data source adapter, and the test Vault database. One automatic cycle must attempt all Custodians, perform one market-data pass, and persist one Snapshot. Prior art is the Auto-refresh test-clock suite, serialized Refresh queue suite, Custodian refresh suite, and Snapshot tests.
- Test automatic failure behavior through the same Refresh-cycle seam. One failed Custodian must not block later Custodians or multiply cycle completion work. The cycle outcome must match the combined result visible to the status caller.
- Test manual Refresh through the existing Custodian module interface. A manual Refresh must remain complete and must still coalesce with a concurrent automatic job for the same Custodian.
- Test the managed-runtime lifecycle through its process-level interface with a fake channel adapter for most cases and one child-process integration test for channel closure. Observations are engine readiness, continued life while the parent channel is open, ownership cleanup request, and termination after closure. Prior art is the managed engine readiness and Vault process suites.
- Test tray state through one projection interface with a recording tray adapter. Feed operational and language events, then assert the visible labels, enabled actions, and number of native menu replacements. Repeated identical state must not replace the menu. Prior art is the existing desktop tray helper suite.
- Test that the managed engine channel carries no financial payload by decoding every allowed operational message against a closed schema and rejecting excess fields.
- Test the Vault Screen-lock deadline through the existing Vault interface with a test clock. Activity before the deadline must postpone Screen lock, inactivity must lock at the configured timeout, and hiding or destroying the renderer must not stop the deadline. Prior art is the Vault lifecycle suite and Auto-refresh test clock.
- Test activity coalescing through the renderer runtime seam with an injected clock and recording adapter. Frequent pointer and keyboard events must produce no more than one engine update per thirty seconds while preserving the most recent activity time.
- Test the window lifecycle through one desktop interface with fake BrowserWindow and clock adapters. Cover active to hidden, reopen within sixty seconds, hidden to dormant, reopen from dormant, repeated close events, app quit, and second-instance activation. Prior art is the desktop main-process helper suite.
- Test that entering dormant state releases the old renderer reference and that reopening reads current Vault status rather than replaying renderer cache. The test observes lifecycle calls and requested state, not garbage collection.
- Test Connector catalog metadata without loading execution adapters. Test each execution adapter through the existing Connector seam and verify that first use loads it once, later use reuses it, and load failure becomes a normal Refresh failure. Prior art is the Connector registry and per-Connector suites.
- Test Market-data source acquisition through fake loaders and a fake clock. Verify lazy first use, reuse, Vault-close release, Screen-lock retention, and failure mapping. Prior art is the injected market-data registry suite.
- Test the search cache through the Market-data module interface. Verify sixty-second freshness, expired-entry removal, the one-hundred-entry capacity, least-recently-used eviction, and Vault-close clearing without inspecting the cache map.
- Keep performance measurements outside deterministic pass-or-fail unit tests. Record the repeatable packaged scenarios and their median results in the issue comments. Mechanism counts such as one cycle completion, zero recurring polls, and cache capacity remain deterministic automated assertions.
- Run the full repository completion check after all changes. Every failure must be fixed or reported as an exact unrelated pre-existing failure.

## Out of Scope

- Changing the fixed fifteen-minute Auto-refresh interval.
- Changing FIFO ordering, the single Refresh worker, or per-Custodian coalescing.
- Running Custodian refreshes concurrently.
- Changing manual Refresh or Snapshot semantics beyond removing duplicate work from automatic cycles.
- Adding new Connector or Market-data source integrations.
- Changing Connector reconciliation, market-data batching, retry policy, or price freshness policy except where required to guarantee one automatic completion pass.
- Changing the packaged desktop ownership model, Vault location, engine token, or Electron process model from ADR 0004.
- Changing the visible Screen-lock timeout choices or allowing the user to configure renderer dormancy.
- Stopping Auto-refresh during the Screen lock.
- Windows or Linux tray support.
- Product analytics, background telemetry, or an in-app performance dashboard.
- A hard cross-machine CPU, memory, or reopen-latency budget. This spec establishes comparable local baselines and removes confirmed repeated mechanisms.
- Reworking SQLCipher connection lifetime. The current Vault session closes its scoped database connection, and no connection leak was found in this review.
- Changing external HTTP connection pooling unless the before-and-after measurements identify it as a material remaining cost.

## Further Notes

The Refresh-cycle correction restores behavior already specified by ADR 0007 and the existing Auto-refresh spec. It does not reopen those decisions.

The one-second parent watcher, minute tray poll, missing tray authentication, fifteen-second Screen-lock poll, eager adapter construction, and unbounded search-cache capacity were observed directly in the implementation. Their individual CPU and resident-memory impact has not been benchmarked. The implementation must keep that distinction visible in its measurement notes.

The highest-value order is Refresh-cycle correction first, managed-runtime lifecycle second, tray state third, then renderer dormancy and external adapter lifetime. The first three remove confirmed repeated work. The latter two need before-and-after measurements to show whether their added lifecycle rules earn their complexity.
