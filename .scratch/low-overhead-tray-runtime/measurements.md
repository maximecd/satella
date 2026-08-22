# Low-overhead tray runtime measurements

This record separates deterministic mechanism counts from packaged-process measurements. The
repository has no pre-change packaged benchmark artifact, and this implementation run did not
have a stable macOS benchmark harness for five-run process-tree sampling. CPU, resident-memory,
and reopen-latency medians therefore remain unmeasured; no performance claim is made for them.

## Deterministic mechanism counts

| Mechanism                                                |             Before |                      After | Evidence                                                                  |
| -------------------------------------------------------- | -----------------: | -------------------------: | ------------------------------------------------------------------------- |
| Automatic market-data passes for three synced custodians |                  4 |                          1 | `apps/engine/src/finance/refresh/AutoRefresh.test.ts`                     |
| Automatic Snapshots for three synced custodians          |                  4 |                          1 | `apps/engine/src/finance/refresh/AutoRefresh.test.ts`                     |
| Managed parent polling                                   |  1-second interval |         0 recurring timers | `apps/engine/src/runtime/ManagedRuntime.ts` and `apps/engine/src/main.ts` |
| Tray HTTP status polling                                 |  2 requests/minute |       0 recurring requests | `apps/desktop/src/main.ts`                                                |
| Screen-lock inactivity polling                           | 15-second interval |     1 cancellable deadline | `apps/engine/src/vault/ScreenLockDeadline.ts`                             |
| Search-cache capacity                                    |          unbounded | 100 entries, 60-second TTL | `apps/engine/src/finance/market-data.ts`                                  |

The automatic-cycle counts are asserted by the high-level refresh test. The remaining rows are
control-flow/mechanism counts, not CPU or memory measurements.

## Packaged macOS benchmark

Pending a repeatable harness that launches the same packaged arm64 build against seeded Vault
scenarios (zero, one, and three synced custodians), samples the whole Electron/renderer/engine
process tree, and records the median of at least five runs for active idle, hidden grace, dormant
idle, warm reopen, and dormant reopen.
