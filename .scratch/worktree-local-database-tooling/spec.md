# Worktree-local database tooling

Status: ready-for-agent

## Problem Statement

Satella development currently resolves SQLite to a shared operating-system application-data directory. Every repository checkout and Git worktree therefore opens the same database unless the developer manually configures an override. Developers and agents working in parallel can change, migrate, or erase one another's data, including the developer's own data, with no visible relationship between the checkout and the database being mutated.

There is also no supported command for returning a development database to a known migrated state, and no deterministic way to populate realistic manual portfolio data without configuring and running a Connector. This makes development, agent execution, and UI verification unpredictable.

## Solution

Give every development checkout and Git worktree a private SQLite data directory at `<worktree-root>/.satella`. Resolve that directory automatically for all repository development entry points, regardless of whether the checkout is the main Git worktree or a linked worktree. Keep `.satella` outside version control.

Provide root-level database commands that act only on the current worktree:

- `db:reset` removes all local database state, recreates the database, and applies every migration.
- `db:seed` transactionally upserts a deterministic set of realistic manual Accounts, Assets, positions, prices, and foreign-exchange data without deleting unrelated data.
- `db:reset --seed` resets, migrates, and seeds in one operation.

Database tooling must refuse to mutate a database owned by a running engine. Seed data uses real, recognizable Asset identities with fixed synthetic quantities and prices. It contains no Connection, requires no Connector, performs no network request, and creates no historical snapshots.

There is no production build or production database location yet. Production startup must not silently choose an operating-system directory or a repository-relative directory. The unresolved production configuration point must be marked with a TODO and fail with a clear error until a production database directory is explicitly designed.

## User Stories

1. As a developer using the main checkout, I want its database stored under that checkout, so that the data it mutates is obvious and local.
2. As a developer using a linked Git worktree, I want that worktree to receive its own database automatically, so that branch work cannot alter another checkout's data.
3. As a developer creating a new worktree, I want database isolation without manual environment configuration, so that isolation is the default rather than a convention.
4. As an agent working in one worktree, I want all normal development commands to select that worktree's database, so that I cannot accidentally mutate the developer's or another agent's data.
5. As a developer running multiple worktrees concurrently, I want each engine to use a different SQLite file, so that they do not contend for or overwrite shared state.
6. As a developer running multiple processes in the same worktree, I want them to agree on one database location, so that the checkout has one predictable state.
7. As a developer, I want the main checkout and linked worktrees to follow identical rules, so that there is no hidden privileged or protected database.
8. As a developer, I want the local database, WAL files, shared-memory files, backups, and ownership metadata contained under `.satella`, so that generated state does not clutter source directories.
9. As a developer, I want `.satella` ignored by Git, so that local database state cannot be committed accidentally.
10. As a developer invoking a development command from a nested package, I want the Git worktree root resolved automatically, so that the selected database does not depend on my current subdirectory.
11. As a developer, I want an explicit absolute data-directory override to remain available, so that tests and exceptional workflows can select an isolated location deliberately.
12. As a developer, I want an invalid or relative explicit override rejected, so that ambiguous database paths cannot be used silently.
13. As a developer, I want startup logs to show the resolved database path, so that I can verify which checkout owns the active data.
14. As a developer, I want a single root command to reset the current worktree's database, so that I do not need to locate and delete SQLite files manually.
15. As a developer resetting a database, I want all prior database state and associated SQLite sidecar files removed, so that the result is genuinely clean.
16. As a developer resetting a database, I want all registered migrations applied before the command succeeds, so that the result is immediately usable by the current engine.
17. As a developer resetting a database, I want stale backups removed with the discarded local state, so that a reset does not retain misleading remnants of the old database.
18. As a developer, I want reset to affect only the current worktree's `.satella` directory, so that other worktrees remain unchanged.
19. As a developer, I want reset to fail before deleting anything when the current worktree's engine owns the database, so that active SQLite state is never removed underneath a running process.
20. As a developer, I want a clear reset failure message naming the selected database and explaining that the engine must be stopped, so that recovery is straightforward.
21. As a developer, I want stale process-ownership metadata ignored or repaired when no owning process remains, so that an abnormal engine exit does not permanently block tooling.
22. As a developer, I want a single command to populate useful portfolio data, so that I can exercise the application without configuring a Connection.
23. As a developer, I want seeding to run only after migrations, so that fixture creation always targets the current schema.
24. As a developer, I want seeding to be transactional, so that a failure cannot leave a partially populated fixture.
25. As a developer, I want repeated seed runs to converge on the same fixture state, so that the command is safe and predictable.
26. As a developer, I want seed rows to use stable identifiers, so that rerunning the seed repairs deleted or edited fixture rows rather than creating duplicates.
27. As a developer, I want unrelated Accounts, Assets, positions, and prices preserved by seed, so that adding fixtures is non-destructive.
28. As a developer, I want seeded Accounts to be ordinary manual Accounts, so that I can edit and delete them through normal product behavior.
29. As a developer, I want rerunning seed to restore the canonical fixture values for fixture-owned identifiers, so that I can return the fixture to a known state.
30. As a developer, I want one mixed brokerage Account containing Cash and several Stocks & ETFs, so that Account and portfolio views exercise heterogeneous holdings.
31. As a developer, I want a second cash-focused Account with another currency, so that multi-currency valuation is exercised.
32. As a developer, I want at least one fractional position, so that quantity display and valuation do not assume whole shares.
33. As a developer, I want seeded Assets to use real names, symbols, and strong public identifiers, so that development screens look credible and Asset identity behavior is exercised.
34. As a developer, I want seeded quantities, prices, and exchange rates fixed in source control, so that results do not change with time.
35. As a developer, I want required foreign-exchange prices included, so that all seeded holdings can contribute to Portfolio value in the Reporting currency.
36. As a developer, I want no network access during seed, so that the command works offline and cannot fail because of a market-data source.
37. As a developer, I want no Connection or Connector configuration in the fixture, so that seed never requires credentials or exercises refresh ownership rules.
38. As a developer, I want seed to create no historical snapshots, so that synthetic fixture data is not presented as genuine Portfolio value history.
39. As a developer, I want one command to reset and seed, so that agents and humans can establish the canonical fixture from any prior state.
40. As a developer, I want `db:reset --seed` to report success only after reset, migration, and seed all complete, so that subsequent commands can rely on the fixture.
41. As a developer, I want database commands to print the worktree and database path they selected, so that destructive scope is visible.
42. As a developer, I want database command failures to exit non-zero with actionable messages, so that scripts and agents cannot mistake partial work for success.
43. As a future packager, I want production startup to throw at the unresolved database-location boundary, so that local-development behavior cannot become an accidental production policy.
44. As a future packager, I want a visible TODO at that boundary, so that production data ownership must be designed intentionally.

## Implementation Decisions

- The canonical development data directory is `.satella` under the current Git worktree root. The database remains named `satella.sqlite`, and backups and SQLite sidecar files remain contained by that directory.
- Repository development entry points resolve the Git worktree root rather than deriving storage from the process working directory. The main worktree and linked worktrees use exactly the same algorithm.
- The existing explicit data-directory override remains supported for tests and exceptional workflows. It must remain a non-empty absolute path and takes precedence over automatic development resolution.
- Development startup must supply or select an explicit development database context. There is no operating-system application-data fallback.
- Production startup without a deliberately configured production database directory throws a typed, actionable configuration error. The production configuration branch contains a TODO explaining that packaging must define data ownership before production startup is enabled.
- `.satella` is ignored as a directory. All generated database state, backups, SQLite sidecars, and live ownership metadata are kept inside it.
- The engine records ownership of the selected database for its process lifetime. Database mutation commands check that ownership before changing files, reject a live owner, and tolerate stale ownership left by a process that no longer exists.
- The root command interface is `db:reset`, `db:seed`, and `db:reset --seed`. Commands operate on the current worktree unless the existing explicit absolute data-directory override is supplied.
- `db:reset` removes the selected development data directory's database state, including backups and SQLite sidecars, recreates private directories, opens a new database, and runs the complete registered migration chain.
- Reset performs no special-case protection for the main worktree. Its safety boundary is the resolved current worktree and the live-engine ownership check.
- `db:seed` opens the selected database through the normal database bootstrap so that migrations and database invariants apply before seeding.
- Seed writes all fixture records in one transaction and uses stable, namespaced fixture identifiers.
- Seed uses upsert behavior for the fixture-owned records. It restores their canonical values on every run and does not delete or modify unrelated records.
- Seeded Accounts have no Connection and no Connector account identifier. They are normal manual Accounts after creation.
- The canonical fixture contains two Accounts:
  - `Demo Brokerage`, based in USD, holding 12,500 USD Cash, 12.5 Apple shares, 4 Microsoft shares, and 7.25 Vanguard S&P 500 ETF shares;
  - `Demo Euro Cash`, based in EUR, holding 8,000 EUR Cash.
- The Stocks & ETFs use real Asset identities: Apple (`AAPL`, ISIN `US0378331005`), Microsoft (`MSFT`, ISIN `US5949181045`), and Vanguard S&P 500 ETF (`VOO`, ISIN `US9229083632`). Their Yahoo symbols are recorded alongside their ISINs.
- Fixture prices are fixed at 200 USD for AAPL, 450 USD for MSFT, and 550 USD for VOO. EUR is fixed at 1.10 USD. Every quote uses a manual source and the fixed quote time `2026-01-01T00:00:00Z`.
- The seed reuses migrated ISO Cash Assets rather than creating competing currency records.
- The seed performs no market-data refresh, Connection refresh, Connector invocation, or network request.
- The seed does not insert snapshots or claim historical Portfolio value.
- `db:reset --seed` composes the same reset and seed operations rather than maintaining a separate implementation path.
- Commands print the resolved worktree root, selected database path, and completed operation. Errors identify the selected database and leave a non-zero process exit status.
- The work introduces no new portfolio-domain terminology. It uses Account, Asset, Asset category, Cash, Connection, Connector, Portfolio value, and Reporting currency as defined by the domain glossary.
- This development-storage policy is reversible tooling rather than a durable product-domain decision, so it does not require an ADR.

## Testing Decisions

- The primary test seam is one process-level integration suite exercising the public development and `db:*` command boundary in temporary Git repositories. Tests assert externally visible command results and resulting engine/database behavior rather than private path helpers or individual SQL statements.
- The suite creates a temporary Git repository and at least one linked worktree, invokes the same public commands a developer or agent uses, and verifies that each checkout selects a distinct `.satella/satella.sqlite`.
- Isolation tests create distinguishable state in each checkout and prove that reset and seed in one checkout do not change the other checkout.
- Resolution tests invoke commands from the worktree root and from a nested workspace location and verify that both resolve the same worktree-local database.
- Override tests use an explicit absolute data directory and verify precedence over worktree resolution; invalid relative and empty overrides remain rejected.
- Reset tests begin with migrated data, backups, and SQLite sidecars, invoke reset, and verify that only a fresh fully migrated database remains.
- Live-ownership tests start an engine against the selected database, invoke reset and seed as separate processes, and verify non-zero exits without database mutation. A stale ownership case verifies recovery after the owning process has exited.
- Seed tests inspect behavior through the migrated engine/database boundary and verify the two manual Accounts, expected Cash and Stocks & ETFs Assets, positions, strong identifiers, deterministic prices, and foreign-exchange data.
- Idempotency tests run seed repeatedly and verify stable row identities, stable values, and no duplicate Accounts, Assets, identifiers, positions, or prices.
- Repair tests edit or delete fixture-owned records, rerun seed, and verify restoration of the canonical fixture.
- Non-destructive tests create unrelated manual data before seeding and verify that it remains unchanged.
- Transaction tests arrange an externally visible identifier conflict, invoke the public seed command, and verify that none of that run's fixture changes are committed.
- Composition tests run `db:reset --seed` from a dirty database and verify the same final state as separate successful reset and seed commands.
- Offline tests deny network access while seeding and verify successful completion.
- History tests verify that seed inserts no snapshots.
- Production-boundary tests invoke startup without a development or explicit database context and assert the clear production-not-configured failure.
- Existing temporary-database and full-migration test utilities are prior art for scoped SQLite lifecycle and schema setup. Existing finance service tests are prior art for validating Accounts, Assets, positions, prices, and Portfolio valuation against the real migrated schema.

## Out of Scope

- Designing or implementing the production database location.
- Packaging the engine or desktop application for production.
- Migrating data from the previous operating-system application-data database into a worktree.
- Preserving the developer's current shared local database.
- Giving the main worktree different protection or behavior from linked worktrees.
- Isolating multiple agents that intentionally operate inside the same worktree.
- Creating disposable per-process or per-agent databases.
- Adding an in-application reset or seed control.
- Seeding Connections, Connector configuration, credentials, or connector-managed Accounts.
- Calling a market-data source or using current market prices.
- Generating historical snapshots or synthetic Portfolio value history.
- Modeling transactions, deposits, withdrawals, cost basis, performance, or returns.
- Changing Reporting currency persistence or its current USD default.
- Changing the portfolio schema, Asset category taxonomy, or Account model.
- Cleaning up legacy user-interface vocabulary unrelated to database tooling.

## Further Notes

- Existing development behavior points all unconfigured checkouts at one operating-system application-data database. This spec intentionally removes that fallback; loss of the current local data is accepted.
- SQLite WAL permits multiple clients, so checking for file existence or relying on a failed open is not a sufficient active-engine guard. The implementation needs explicit process ownership scoped to the selected database.
- Seed prices are realistic-looking deterministic fixtures, not claims about current or historical market value.
- Cash is represented as an Asset in the `cash` Asset category and held through positions. The legacy `fiat:` identifier prefix does not change the canonical Cash terminology.
