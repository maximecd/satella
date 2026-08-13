# Tooling, Effect Services, and Testing Refactor Plan

## Goal

Make Optimus a predictable, workspace-native monorepo with one shared Vite+ toolchain, colocated and deterministic tests, enforceable coverage, an explicit Effect 4 migration, and small Effect services organized by business resource.

The finished repository should have one obvious command for each concern, no package-local version drift, no test-only path aliases, no `test` or `tests` directory, and no service module that combines unrelated resources, SQL, orchestration, and API-facing workflows.

## Decisions and Scope

- Include Effect 4 in this plan, but isolate it as a behavior-preserving migration between test stabilization and service extraction. This prevents new services from being authored twice while keeping the major-version diff reviewable.
- Effect 4 is still prerelease software at the time of planning. Pin one exact verified release across the entire Effect family; if Effect 4 is stable when implementation begins, use the matching stable release. Never track `latest`, `main`, or a range that can silently cross prereleases.
- Do not run Effect 3 and Effect 4 in different Optimus workspaces. The Effect catalog, platform adapters, SQL driver, Vitest integration, and lockfile move together in one atomic compatibility step.
- Use T3Code as a reference for root Vite+ configuration, pnpm catalogs, workspace task orchestration, explicit package exports, and the separation of Effect service contracts from live layers. Do not copy its very large test files; Optimus explicitly wants smaller behavioral suites.
- Interpret “one test per file” as one colocated test module per production file, not literally one `it(...)` call per file. Use exactly `thing.test.ts` beside `thing.ts` (or `.test.tsx` beside TSX); integration and concurrency scenarios remain inside that owning test module rather than introducing filename qualifiers.
- Do not add a CI workflow as part of this refactor. The repository commands must be CI-ready, but adopting a CI provider/workflow is a separate owner decision.
- Do not turn root development utilities into a new workspace or add repository-policy scripts. Keep the existing `scripts/dev.mjs`; express normal checks through Vite+, package manifests, and configuration.
- Preserve public behavior and the `@optimus/engine/api` surface while internals move. Schema or API changes require their own product decision.
- This plan supersedes the test paths and standalone Vitest/tooling recommendations in `07-connector-package-split.md`. If plan 07 lands later, every extracted connector package must use the conventions here: colocated tests, root-managed versions/configuration, and Vite+ commands.
- The working tree already contains user-owned Node-version changes in `package.json` and `.nvmrc`. Implementation must reconcile and preserve those changes rather than overwriting them.

## Current-State Findings

As inspected on 2026-08-13:

- The direct baseline passes: web has 17 tests, engine has 57, and connectors have 10, for 84 total.
- The root `pnpm test` and `test:coverage` scripts run only `@optimus/web`, so 67 engine/connector tests are absent from the normal root gate.
- Web uses Vitest 4.1.10 while engine and connectors use Vitest 2.1.9. `@effect/vitest` is installed in the Effect packages but their tests import plain Vitest and manually invoke `Effect.runPromise`.
- Coverage is configured only in `apps/web`; no root command measures engine or connector source.
- Engine and connector tests live under `apps/engine/test` and `packages/connectors/test`. Web has a `src/test/setup.ts` directory plus a 512-line, 15-scenario route suite.
- The largest engine modules combine multiple responsibilities:
  - `finance/service.ts`: 1,230 lines covering assets, custodians, accounts, positions, snapshots, history, dashboard queries, connector workflows, and add-assets flows;
  - `finance/market-data.ts`: 808 lines covering provider clients, lookup policy, quote refresh, persistence, and concurrency;
  - `finance/connector.ts`: 405 lines of reconciliation and persistence;
  - `database/migrations.ts`: 370 lines covering history validation, backup, pruning, execution, and database validation.
- Test modules repeat temporary-directory creation, database layer construction, `Effect.runPromise`, and cleanup. One concurrency test uses a real 20 ms sleep, and several tests use the wall clock directly.
- Engine tests rely on the `@engine/*` TypeScript/Vitest alias while production imports use another resolution path. This is an unnecessary test-only module graph.
- `@optimus/connectors` exports built `dist` files, which forces engine lifecycle hooks to build it before build, test, and typecheck. Root scripts and `scripts/dev.mjs` hard-code the current workspace topology.
- Shared dependencies are repeated with literal versions in package manifests. pnpm catalogs are not used.
- A range-based `devEngines.packageManager` selected pnpm 11.21.0 from the lockfile during the baseline run and attempted a registry-backed verification before tests could start. Once dependencies were bypassed and the local test binaries were used, the suites passed. Bootstrap reproducibility is therefore a separate issue from suite correctness.
- The Effect 4 blast radius includes core services and schemas plus packages currently imported from `@effect/platform`, `@effect/experimental`, `@effect/sql`, `@effect/platform-node`, and `@effect/sql-sqlite-node`. HTTP/HttpApi, SQL, and reactivity move to `effect/unstable/*` namespaces in v4, while the Node and SQLite adapters remain separate lockstep-versioned packages.

## Target Repository Shape

The exact resource names may adjust during extraction, but the dependency direction should be fixed:

```text
optimus-2/
  vite.config.ts                 # shared Vite+, test, lint, format, and task policy
  tsconfig.base.json             # shared strict TypeScript policy
  pnpm-workspace.yaml            # workspace globs, catalog, and necessary overrides
  apps/
    engine/
      vite.config.ts             # merges root; node/pack/integration differences only
      tsconfig.json
      src/
        api/
          Api.ts                 # HttpApi schemas and stable public types
          Api.test.ts
          FinanceApiLive.ts      # handlers consume service tags, never SqlClient directly
          FinanceApiLive.test.ts
        database/
          DatabaseConfig.ts
          DatabaseLive.ts
          DatabaseLive.test.ts
          Migrations.ts
          Migrations.test.ts
          Migrations/
            0001_....ts
            0001_....test.ts
          DatabaseTestLayer.ts   # scoped test support, not a global runtime
        finance/
          assets/
            Models.ts
            AssetService.ts      # service contract/tag only
            AssetServiceLive.ts  # SQL implementation layer
            AssetServiceLive.test.ts
          custodians/
            CustodianService.ts
            CustodianServiceLive.ts
            CustodianServiceLive.test.ts
          accounts/
            AccountService.ts
            AccountServiceLive.ts
            AccountServiceLive.test.ts
          positions/
            PositionService.ts
            PositionServiceLive.ts
            PositionServiceLive.test.ts
          portfolio/
            PortfolioService.ts
            PortfolioServiceLive.ts
            PortfolioServiceLive.test.ts
          add-assets/
            AddAssetsService.ts
            AddAssetsServiceLive.ts
            AddAssetsServiceLive.test.ts
          connectors/
            ConnectorCatalog.ts
            ConnectorSync.ts
            ConnectorSyncLive.ts
            Reconciliation.ts
            Reconciliation.test.ts
          market-data/
            MarketDataService.ts
            MarketDataServiceLive.ts
            ProviderCatalog.ts
            Resolution.ts
            Resolution.test.ts
            Refresh.test.ts
          FinanceLive.ts         # composition only
        main.ts                  # configuration and launch only
    web/
      vite.config.ts             # merges root; React, StyleX, jsdom configuration
      vitest.setup.ts            # package setup without a test directory
      src/
        screens/
          dashboard.tsx
          dashboard.test.tsx
          add-assets.tsx
          add-assets.test.tsx
          ...
        routes/
          ...                    # route-specific tests beside route modules when needed
    desktop/
      vite.config.ts
      src/
        main.ts
        main.test.ts
  packages/
    connectors/
      vite.config.ts
      src/
        connector.ts
        connector.test.ts
        registry.ts
        registry.test.ts
        okx/
          client.ts
          client.test.ts
          connector.ts
          connector.test.ts
          schemas.ts
          schemas.test.ts
        ibkr/
          client.ts
          client.test.ts
          parser.ts
          parser.test.ts
          connector.ts
          connector.test.ts
```

If plan 07 splits connector packages first, use the same internal shape inside `connector-core`, `connector-okx`, and `connector-ibkr`; do not recreate package-local Vitest configs or top-level test directories.

## Shared Toolchain Design

### Runtime and package-manager bootstrap

- Choose one exact Node release and keep `.nvmrc`, `engines.node`, Vite+ environment configuration, local development, and any future automation aligned. The in-progress repository choice is Node 26.7.0 / Node 26 unless the owner changes it before implementation.
- Replace the range-only package-manager declaration with an exact `packageManager` pin. Keep `devEngines` only if it adds enforcement that Vite+ does not already provide.
- Pin `vite-plus` exactly. Run the same local Vite+ version everywhere; do not use `latest` or floating versions.
- Validate both fresh online installation and commands after the dependency store is warm/offline. A local test run must not silently select a newer pnpm than the repository records.

### pnpm catalog and workspace dependencies

- Add a root `catalog` in `pnpm-workspace.yaml` for every third-party version intentionally shared across workspaces. At minimum include `effect`, the `@effect/*` family, `@effect/vitest`, `vite-plus`, TypeScript/tsgo packages, `@types/node`, React, Vite-facing React plugins, and Vitest coverage/environment packages that remain direct dependencies.
- Use `catalog:` in workspace manifests rather than repeating literal versions. Keep provider-only dependencies such as `saxes`, Yahoo Finance, CoinGecko, Electron, and jsdom only in the workspaces that actually import them.
- Continue using `workspace:*` for private internal packages. Use a publish-safe workspace range in connector packages only when plan 07 makes them independently packable.
- Add only the Vite+/Vitest overrides required by the installed Vite+ and Effect 4 releases. In particular, follow Vite+ migration output so every consumer resolves one Vitest 4.1+ runtime and Vite resolves to the Vite+ core alias. Verify with `pnpm why vite vitest @effect/vitest` rather than copying T3Code's prerelease patches blindly.
- Make workspace package manifests the dependency graph. Root build/test/typecheck commands must discover packages recursively rather than list package names.

### Vite+ migration

1. First align engine/connectors with Vite 8+ and Vitest 4.1+, as required by the Vite+ migration guide. Use an Effect 3-compatible `@effect/vitest` temporarily so Vite+ and test-layout changes can be verified before the Effect major upgrade.
2. Run `vp migrate --no-interactive --no-agent --no-editor --no-hooks` at the workspace root as a reviewed migration aid. Do not accept its diff blindly.
3. Create root `vite.config.ts` with `import "vite-plus/test/config"` and shared configuration for:
   - Oxfmt options and ignores currently in `.oxfmtrc.json`;
   - Oxlint plugins, correctness rules, ignores, and type-aware/type-check behavior currently absent from `.oxlintrc.json`;
   - default Node test behavior, isolation, cleanup, timeouts, coverage provider/reporters, and no focused/skipped tests;
   - Vite Task definitions and cache policy for deterministic build, typecheck, test, coverage, and packaging tasks.
4. Move package-specific configuration into package `vite.config.ts` files that merge the root config. Keep only genuine differences:
   - web: React/TanStack/StyleX transforms, jsdom, and `vitest.setup.ts`;
   - engine: Node packaging plus any proven integration-test concurrency constraint;
   - connectors: library packaging and static asset handling;
   - desktop: Electron main-process output format and smoke-test environment.
5. Delete `.oxlintrc.json`, `.oxfmtrc.json`, and all `vitest.config.*` files after the equivalent behavior is present and verified in Vite+ config. Vite+ explicitly recommends its config over standalone tool configs.
6. Rewrite normal Vitest imports to `vite-plus/test`. Effect tests import the enhanced `it` from `@effect/vitest` and may import `describe`, `expect`, and mocks from `vite-plus/test`, matching the single Vite+ runner identity.

### TypeScript configuration and imports

- Retain one root `tsconfig.base.json` for strict shared rules: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, casing checks, side-effect import checks, erasable syntax, and consistent module semantics.
- Add `@effect/tsgo` after the Effect 4 version is pinned and verify it against the repository's TypeScript version. Enable actionable diagnostics incrementally; start with service dependency leaks, unsafe Effect assertions, unknown error handling, nondeterministic globals, and barrel imports rather than importing T3Code's full policy wholesale.
- Keep package `tsconfig.json` files small. They should specify only environment differences such as DOM/JSX for web and Node/Electron types for runtime packages.
- Prefer `noEmit` typechecking and let `vp build`/`vp pack` own output. Where declaration emission is required for a packable connector, configure it through the package's Vite+ `pack` block instead of running `tsc -b` as a second build system.
- Remove the `@engine/*` path alias and its Vitest alias. Colocated tests use relative imports to the module they own. Cross-workspace code imports only declared package export-map paths.
- Adopt one relative-import convention supported by the final TypeScript/Vite+ configuration. Prefer explicit `.ts` source imports with `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` if the pinned toolchain supports them end to end; otherwise keep `.js` NodeNext specifiers consistently. Never mix conventions per package.
- For private workspace packages consumed during development, expose intentional source subpaths in `exports` so tests and dev mode do not depend on stale `dist`. Packable packages can use `publishConfig.exports` for built output and must have a separate built-artifact smoke test.
- Avoid root barrel exports for internal engine code. The stable `@optimus/engine/api` export is the deliberate public boundary; internal services should import their exact modules so dependency direction stays visible.

### Root commands

The exact JSON can follow the installed Vite+ version, but the public command contract should be:

| Command | Required behavior |
| --- | --- |
| `vp check` / `pnpm check` | Format check, Oxlint, and typecheck the whole repository |
| `pnpm format` | Run `vp fmt` in write mode |
| `pnpm lint` | Run `vp lint` with the shared root policy |
| `pnpm typecheck` | Run typechecking across every workspace/tsconfig, not a named package list |
| `pnpm test` | Run every workspace test once and exit |
| `pnpm test:watch` | Start an explicit watch workflow; plain `test` never watches |
| `pnpm test:coverage` | Run coverage for every source-owning workspace and enforce thresholds |
| `pnpm build` | Build/pack every workspace in dependency order |
| `pnpm dev` | Start the dependency-aware watch graph and applications with one readiness barrier |

- Use `vp run -r` for recursive tasks and let workspace dependencies establish ordering.
- Do not use `--if-present` for required quality tasks; every source-owning workspace must declare the expected script. Use it only for genuinely optional tasks and document why.
- Keep the existing custom development runner only for selecting free ports and waiting for application readiness. Do not create a `scripts` workspace or ancillary policy/smoke/version scripts in this refactor.
- Remove engine `prebuild`, `pretest`, and `pretypecheck` rebuild hooks after source exports or dependency-aware Vite+ tasks make them unnecessary.

## Effect 4 Migration

### Version and dependency policy

- Choose one exact Effect 4 release only after checking that it publishes matching versions of every required adapter: `effect`, `@effect/platform-node`, `@effect/sql-sqlite-node`, and `@effect/vitest`. Put those packages on one catalog entry/version and verify the resolved graph during migration; do not add a bespoke version-check script.
- Remove consolidated v3 packages after imports move:
  - `@effect/platform` HTTP and HttpApi modules move under `effect/unstable/http` and `effect/unstable/httpapi`;
  - `@effect/sql` modules move under `effect/unstable/sql`;
  - `@effect/experimental` reactivity moves under `effect/unstable/reactivity`.
- Keep platform/provider packages that remain external in v4, including `@effect/platform-node` and `@effect/sql-sqlite-node`, but bump them in lockstep with `effect`.
- Treat every `effect/unstable/*` import as an explicit maintenance boundary. Import the named namespace from Effect's supported upstream category export (for example `effect/unstable/sql`) at its use site; do not mirror Effect modules through local `src/effect` facades.
- Do not copy T3Code's `effect` patch: its current patch changes MCP/RPC behavior unrelated to Optimus. Inspect its `@effect/vitest` patch only as evidence of a Vite+ runner-identity issue.
- Before patching `@effect/vitest`, run a small compatibility spike using the chosen release: one `it.effect`, one `it.layer`, fake timers/TestClock, mocking, and coverage through `vp test`. Prefer an upstream release or pnpm override/package extension. If a patch is still necessary, keep it minimal, test it, link the upstream issue, pin its exact source version, and add a removal condition.

### Migration inventory and compatibility matrix

Create a checked-in migration inventory before changing imports. Classify each current Effect usage as mechanical, semantic, or removed/manual:

| Area | Optimus surface to inventory | v4 migration concern |
| --- | --- | --- |
| Core services | `Context.GenericTag`, yielded tags, `Layer.effect`, `Layer.scopedContext` | migrate tags to `Context.Service`; re-check provided/required service types and layer memoization |
| Errors and recovery | `catchAllCause`, `catchAllDefect`, tagged/domain errors | flattened `Cause` and renamed `catch*` combinators; preserve typed error boundaries |
| Scope/runtime | scoped SQLite client, `Layer.launch`, `NodeRuntime.runMain` | changed scope/runtime and fiber keep-alive semantics; prove finalizers and process exit |
| Schema | API contracts, connector credentials/output, SQL row decoders | v4 Schema constructor, optionality, transform/refinement, decode/encode, and parse-error changes |
| HTTP/HttpApi | API declaration, handlers, client, middleware, CORS, error logging | imports move to unstable modules and several builder/client signatures change |
| SQL/SQLite | client construction, tagged SQL templates, transactions, migrations, backup | unstable SQL imports, driver API, error types, transaction/finalizer behavior |
| Reactivity | SQLite client setup | consolidated unstable reactivity module and layer wiring |
| Testing | `@effect/vitest`, `TestClock`, layers, exits | matching v4 package, scoped tests, Vite+ identity, and changed equality/Exit representations |

- Generate the inventory with repository searches and compiler errors, then link every non-mechanical item to a focused test. Do not treat “it compiles” as proof that encoding, errors, transactions, or lifecycle behavior stayed the same.
- Use the official v3→v4 import/API maps and topic migration guides as the first authority. Where documentation is incomplete, compare the pinned v3 and v4 source/tag and add a regression test before choosing a replacement.
- Record the chosen Effect version, migration-guide commit/tag, package compatibility matrix, required pnpm overrides/extensions, and any temporary patch in the plan implementation notes so later upgrades are reproducible.

### Core and service migration

- Convert `Context.GenericTag` and any v3 tag/service idioms to v4 `Context.Service` classes with deterministic identifiers. Keep service contracts separate from live layers as defined by this plan.
- Migrate core combinator renames mechanically first, then review semantics for error channels, defects, interruption, forking, scope, and memoization. Avoid opportunistic style rewrites in the same diff.
- Audit every `Effect.provide` and layer composition point after the migration. V4 layer memoization/provision behavior changed; service construction counts, database connections, and connector clients must remain intentional.
- Replace direct global time, UUID, environment, fetch, filesystem, and timers while touching affected code, using Effect v4 services. Enable the matching `@effect/tsgo` diagnostics only after the replacements compile and tests exist.
- Add startup/shutdown tests around `NodeRuntime.runMain`/`Layer.launch` behavior because v4's fiber keep-alive and scope behavior can change whether the engine exits or finalizes resources.

### Schema and public contract migration

- Migrate schemas in small resource groups: connector contracts, finance domain contracts, API path/query/payload schemas, database row schemas, then error schemas.
- Add encode/decode golden tests before each group moves. Assert both accepted values and exact rejection categories for optional fields, numeric transformations, redacted credentials, unions, literals, and tagged errors.
- Pay special attention to v4 changes in optional keys/defaults, records, unions, transforms/refinements, redacted values, `Schema.decode*`, and parse issue formatting. Do not preserve a v3 API name through a local compatibility wrapper if v4 semantics differ.
- Keep `@optimus/engine/api` source-compatible for the web where possible. Verify generated HttpApi clients/types and representative JSON request/response bodies before and after migration.
- Run TypeScript API snapshot or compile fixtures for connector implementers so a connector cannot silently compile against v3 types while the engine uses v4.

### HTTP, SQL, and platform migration

- Move API definitions/builders and HTTP clients to the pinned `effect/unstable/http*` modules one vertical slice at a time. Preserve route paths, methods, status codes, CORS behavior, logging/redaction, and encoded error responses with API integration tests.
- Update Fetch and Node HTTP layers separately. Test a real loopback server on an ephemeral port rather than relying only on handler-level tests.
- Migrate generic SQL imports to `effect/unstable/sql/*` and the SQLite adapter to the matching `@effect/sql-sqlite-node` release. Prefer the official adapter; create an Optimus-owned adapter only if a tested capability is unavailable.
- Re-run every migration, rollback, backup, foreign-key, busy-timeout, transaction, and shutdown integration test against v4. Inspect SQLite error classification and interruption behavior rather than asserting only happy-path rows.
- Confirm connector packages no longer depend on removed platform packages and that their fake/live HTTP clients expose the same service contract.

### Effect 4 acceptance gate

The Effect 4 phase is complete only when:

- `pnpm why effect @effect/platform-node @effect/sql-sqlite-node @effect/vitest` shows one matching Effect 4 release family and no Effect 3 runtime;
- no removed v3 package/import remains and no local compatibility facade re-exports Effect packages;
- the complete colocated test suite, coverage gate, typecheck, lint, build/pack, and built-output smoke tests pass without lowering thresholds;
- API golden tests, connector compile/contract tests, and SQLite migration tests demonstrate unchanged external/persistent behavior;
- engine start, signal handling, resource finalization, and clean process exit work under the chosen Node version;
- no broad compatibility facade or untracked patch hides unresolved v3 semantics.

## Effect Service Refactor

### Service boundary rules

- Each business resource owns a small Effect service contract/tag and a separate live implementation layer. The public service API returns domain errors and hides `SqlClient`, `HttpClient`, filesystem, clock, and crypto requirements behind the layer.
- A service contract should describe use cases, not mirror every SQL helper. Keep row decoding, queries, and transactions private to the corresponding live layer or a narrowly named repository module when the layer remains large.
- Export a `make` function where direct dependency injection makes focused tests clearer, plus `layer`/`Live` for application composition. Test layers are explicit and fail loudly for unconfigured methods.
- Compose services once in `FinanceLive.ts`; compose infrastructure once in `DatabaseLive.ts`; compose API handlers in `FinanceApiLive.ts`; keep `main.ts` limited to environment parsing, layer composition, and launch.
- Do not use a global built-in connector registry inside service logic. Inject a `ConnectorCatalog` service so discovery and execution share one catalog and tests can provide a synthetic connector.
- Replace global nondeterminism with Effect services:
  - `Clock`/`DateTime` for timestamps and staleness;
  - `Crypto` or an ID-generator service for UUIDs;
  - `HttpClient` or provider client services for remote calls;
  - scoped filesystem/database resources for temporary and live storage.
- Use `Effect.fn` names on meaningful service operations so failures and traces identify the resource/use case.
- Keep transactions at use-case boundaries. Cross-resource workflows such as add-assets and connector reconciliation orchestrate lower-level services without exposing partially committed state.

### Extraction map

Split the existing `finance/service.ts` in behavior-preserving slices:

| Existing responsibility | Target owner |
| --- | --- |
| Asset CRUD, identifiers, manual prices | `assets/AssetService` + `AssetServiceLive` |
| Custodian CRUD and connector-managed write rules | `custodians/CustodianService` + live layer |
| Account CRUD and ownership rules | `accounts/AccountService` + live layer |
| Position CRUD and absolute quantity rules | `positions/PositionService` + live layer |
| Snapshots, due policy, history, dashboard read model | `portfolio/PortfolioService` + live layer; split dashboard query if it grows independently |
| Add manual holding, cash account, other asset | `add-assets/AddAssetsService` + transactional live layer |
| Connector capabilities, authentication, sync orchestration | `connectors/ConnectorCatalog` and `ConnectorSync` |
| Connector normalization and atomic reconciliation | pure normalization beside `connectors/Reconciliation`, SQL live implementation separately |
| Provider lookup, resolution, quote fetch, coalescing | `market-data` service, pure resolution module, provider adapters, and live coordinator |

Split `database/migrations.ts` by policy rather than arbitrary line count:

- registry parsing/history validation;
- database integrity checks;
- backup creation and retention;
- migration execution/transaction orchestration.

Keep the production migration registry explicit and ordered. Migration files remain immutable after release, and each nontrivial migration gets a colocated test against its supported prior schema.

### Safe extraction sequence

For each resource:

1. Add or split characterization tests around current behavior.
2. Define the service contract and domain error surface.
3. Move SQL/provider implementation behind the live layer without changing API payloads or database schema.
4. Change API handlers and dependent workflows to consume the service tag.
5. Run the focused unit/integration tests and full suite.
6. Delete the old exports for that resource only after no caller remains.

Do not rewrite the entire finance module in one commit. Assets → custodians → accounts/positions → portfolio → add-assets → connectors → market data is a reasonable dependency order.

## Test Architecture

### File placement and naming

- Delete `apps/engine/test`, `packages/connectors/test`, and `apps/web/src/test` only after every file/fixture has moved to its owning source directory.
- Default to `Thing.test.ts` or `Thing.test.tsx` beside `Thing.ts`/`Thing.tsx`.
- Use only `.test.ts` / `.test.tsx` for executable tests. Describe integration, contract, concurrency, or smoke scope in the suite and test names, not in extra filename qualifiers.
- Keep fixtures beside the parser/provider that owns them, for example `ibkr/fixtures/*.xml`. Fixtures are inert data, not a replacement `tests` tree.
- Move web setup to `apps/web/vitest.setup.ts`. Keep package-specific helper modules colocated and named `*.test-utils.ts`; exclude those helpers from production exports and coverage.
- Keep this convention visible in the plan and normal review; do not add a bespoke repository-policy script solely to police filenames or directories.

### Split current all-in-one suites

- Replace `apps/web/src/finance-routes.test.tsx` with screen/route-owned tests. Keep only router integration behavior in a small route-level suite; move add-assets, dashboard, custodian, account, settings, form decoding, and valuation scenarios beside the corresponding screen or form module.
- Split engine `service.test.ts` along the new service boundaries. A service test should build only the layer graph needed by that service.
- Keep market-data scenarios in `market-data.test.ts`, grouped by descriptive suites/tests. Replace the real 20 ms sleep with `Deferred`, latches, or `TestClock` coordination.
- Split connector provider suites by client request/signing, schema/parser behavior, connector mapping, and failure mapping. Keep end-to-end provider-flow tests as contract/integration tests using a fake HTTP transport and static fixtures.
- Split compound migration assertions into individual behaviors so a failure identifies edited history, removed history, duplicate IDs, newer-than-binary history, rollback, backup, or integrity checking directly.
- Data-driven `it.each` is acceptable when all rows test one invariant, such as API endpoint presence. It is not an excuse to combine unrelated workflows.

### Effect + Vitest conventions

- Use `it.effect` for Effect programs so test services and a fresh scope are managed by `@effect/vitest`. Do not wrap every test in `Effect.runPromise`.
- Use `it.live` only when a test intentionally needs the live clock/runtime and state why. Most domain tests should use the test environment.
- Use `it.layer` for an immutable or safely reset shared layer inside one suite. Mutable SQLite state should normally use a fresh scoped test layer per test unless transaction rollback/reset is proven.
- Put assertions inside the returned Effect. Test typed failures via `Effect.exit`/`Exit` or Effect test helpers instead of converting every failure to a rejected Promise.
- Use `TestClock` for schedules, staleness, debounce, and snapshot intervals. Use seeded test random/crypto services for IDs when exact values matter.
- Do not use Vitest retries, `it.flakyTest`, arbitrary sleeps, current wall-clock time, real provider network calls, or shared fixed temporary paths to make a test pass.
- A scoped `DatabaseTestLayer` should acquire a unique temporary directory/database, run selected migrations, expose service dependencies, close the client, and remove the directory in its finalizer. This replaces repeated `mkdtemp`/`afterEach` arrays.
- Provider fakes should implement the same service contract as live adapters. Unconfigured fake methods should die with a clear message, preventing accidental broad mocks.
- Restore mocks/globals/environment variables automatically between tests. Add an intentional `scrollTo` stub in web setup so jsdom warnings do not hide real console failures.
- Keep Vitest isolation enabled. Do not globally disable file parallelism to mask shared-state bugs. A dedicated serial integration project is allowed only after a reproducible resource constraint remains with isolated databases and proper scopes, and the reason must be documented in config.
- Set explicit finite hook/test/teardown timeouts based on suite type. Prefer local larger timeouts for genuinely slow integration tests over a large global timeout.

### Coverage policy

“As much coverage as possible” should become an enforceable ratchet rather than a one-time report:

1. Configure V8 coverage for every TypeScript/TSX source-owning workspace.
2. Set `coverage.include` explicitly so never-imported source files count as uncovered. Exclude only generated code, declarations, entry-point launch glue that cannot be imported safely, static theme data where justified, and test/test-helper files. Every exclusion needs a comment in config.
3. Capture a baseline after colocating the existing 84 tests. Do not lower it during the service refactor.
4. Set the first enforceable floor to each workspace's measured post-migration baseline rather than an aspirational number that makes the command permanently red. Ratchet those floors upward with meaningful tests; new pure modules should still target 100% unless an explicit unreachable branch is documented.
5. Enable per-file thresholds for the critical/pure modules so a well-covered large file cannot hide an untested new service.
6. Ratchet thresholds upward whenever coverage improves. Do not use `autoUpdate`; update thresholds deliberately in the same change that adds tests.
7. Produce text, JSON, and HTML/LCOV output so local runs and any future CI can retain and inspect reports.
8. Treat coverage as evidence, not the only test-quality metric. Assert transaction boundaries, typed failures, resource cleanup, API contracts, and concurrency ordering even when a line is already covered.

### Required test layers

The completed suite should cover:

- pure unit tests for schemas, validation, row mapping, identifiers, price conversion, connector normalization, provider parsers, and port/config parsing;
- Effect service tests with small fake dependency layers;
- SQLite integration tests for every repository/live layer, migrations from prior schemas, rollback, constraints, backup/restore, and scoped shutdown;
- API integration tests that compose `EngineApi` handlers with test layers and call them through an Effect HTTP client, covering success plus encoded domain failures;
- connector contract tests with fake transports, including partial/invalid provider output and no credential leakage;
- web component/route tests using Testing Library and `userEvent`, one screen/workflow per file;
- one small full vertical integration covering a representative manual asset flow from HTTP request through SQLite and response;
- build verification for engine, desktop, and connector package entry points and static assets.

No normal test may require internet access, real credentials, the user's data directory, a fixed port, or execution order relative to another test file.

## Build, Packaging, and Development

- Use `vp build` for the web application and `vp pack` for TypeScript libraries/Node/Electron entry points where supported by the pinned release.
- Define package `pack` entries, output names/formats, declarations, source maps, clean behavior, and dependency bundling explicitly. Verify Electron's required module format before changing `apps/desktop/package.json#main`.
- Keep connector Markdown/SVG asset copying deterministic and package-local. Build and packed-tarball smoke tests must prove assets are present; source tests alone are insufficient.
- Replace hard-coded root build order with `vp run -r build`. Package dependencies and task `dependsOn` declarations should express ordering.
- Remove stale-output dependencies: a clean checkout must typecheck and test without pre-existing `dist`; a clean build must not resolve deleted output left by an earlier layout.
- Preserve `scripts/dev.mjs` and its dynamic port selection. Adjust it only when package build/export behavior requires a concrete compatibility change.
- Initial build completion is the readiness barrier before starting consumers that require built artifacts. Subsequent watches must propagate changes without manual package lists.
- Do not add cleanup/policy scripts as part of this work; generated outputs remain covered by ignore rules and normal package commands.

## Reproducibility

- Do not add or select a CI workflow/provider in this plan. Keep the following verification order available through repository commands so a later CI decision can invoke it without new application logic:
  1. install from the frozen lockfile;
  2. `vp check`;
  3. full coverage with thresholds;
  4. dependency-ordered build/pack.
- Use a temporary local/release checklist during the migration to run the complete isolated test suite repeatedly with varied worker counts and fail on the first intermittent result. This is evidence for removing the “flaky” label, not a retry mechanism.
- Run selected integration suites once with constrained parallelism to expose hidden ordering assumptions and once with normal parallelism to prove isolation.
- Repository commands must fail on `.only`, unexpected skipped tests, unhandled rejections/errors, leaked handles/resources, coverage regression, formatting drift, or a package missing its required quality scripts.

## Migration Sequence

### 1. Freeze the baseline and bootstrap

- Record the 84-test baseline and current command gaps.
- Reconcile Node files already being edited, pin pnpm and Vite+ exactly, and prove fresh plus warm/offline bootstrap behavior.
- Add pnpm catalogs and resolve shared version drift without changing application behavior.

### 2. Align Vitest before Vite+

- Upgrade engine/connectors to Vitest 4.1+ and a temporary compatible Effect 3 `@effect/vitest`.
- Resolve to one Vitest runtime across the lockfile.
- Run all 84 tests through one temporary root gate before changing test bodies.

### 3. Consolidate the toolchain

- Run and review Vite+ migration.
- Add root/package Vite+ configs, shared Oxlint/Oxfmt/typecheck policy, and recursive package scripts.
- Remove standalone configs only after parity checks pass.

### 4. Colocate and stabilize existing tests

- Move tests beside their source without changing assertions first.
- Remove `@engine` aliases and use the real import graph.
- Introduce scoped database and provider test layers.
- Convert manual `Effect.runPromise` suites to `@effect/vitest` incrementally.
- Split the named all-in-one suites and replace sleep/wall-clock/global-state dependencies.
- Delete old test directories and enable the layout guard.

### 5. Migrate Effect 3 to Effect 4

- Pin one complete, matching Effect 4 release family and capture the compatibility matrix.
- Migrate packages/imports, core APIs, schemas, HttpApi/HTTP, SQL/SQLite, reactivity, runtime, and tests in focused groups.
- Keep API/database/connector golden tests green and do not lower coverage.
- Remove Effect 3 and consolidated v3 packages only after the Effect 4 acceptance gate passes.

### 6. Refactor Effect services resource by resource

- Extract service contract, live layer, tests, composition, and API wiring for one resource at a time.
- Author the extracted services directly with Effect 4 `Context.Service` and v4 layer conventions.
- Keep full suite and coverage non-regressing after every slice.
- Finish by reducing `main.ts` and deleting the old catch-all finance service exports.

### 7. Fill coverage and integration gaps

- Add missing failure, concurrency, transaction, API, vertical, package, desktop, and dev-runner tests.
- Include all source in coverage and raise per-workspace/per-file thresholds to the agreed completion floor.

### 8. Finish Vite+ build/dev migration

- Move build/pack/watch orchestration to Vite+.
- Remove stale pre-hooks and hard-coded package lists.
- Verify clean build, packed exports/assets, live watch propagation, readiness, and shutdown.

### 9. Prove reproducibility

- Run the full gate from a clean checkout/output state.
- Perform repeated parallel and constrained-worker test runs.
- Update developer documentation with only the final supported commands and architecture conventions.

## Completion Criteria

The work is complete when:

- no `test` or `tests` directory exists under apps or packages, and every executable test is colocated with its owner;
- no normal test suite is a cross-resource catch-all; failures identify one service, route, provider concern, migration rule, or integration seam;
- all Effect tests use `@effect/vitest` where appropriate, scoped resources close deterministically, and there are no arbitrary sleeps/retries or real network calls;
- every workspace resolves the same exact Effect 4 family, no Effect 3 or removed v3 package remains, and there is no local facade mirroring Effect exports;
- root `test` and `test:coverage` cover every workspace, not only web;
- Vitest, Vite+, TypeScript, Effect, Oxlint/Oxfmt, Node types, and other shared families resolve through one cataloged/pinned policy without incompatible duplicate runtimes;
- one root Vite+ configuration owns shared lint, format, test, coverage, and task policy; package configs contain only justified differences;
- standalone Vitest/Oxlint/Oxfmt configs and the `@engine` alias are gone;
- `finance/service.ts` and other catch-all modules are replaced by resource services with separate contracts and live layers, and API handlers do not depend directly on SQL;
- coverage includes unimported source, meets the agreed workspace/per-file floors, and cannot regress silently;
- fresh install, warm/offline invocation, `vp check`, full tests, coverage, build/pack, export smoke tests, and development startup all work with the documented versions;
- plan 07's current or future connector packages automatically participate in root quality/build commands without adding package names or duplicate tool configs.

## Non-Goals

- tracking Effect `main`, floating across Effect 4 prereleases, or adopting T3Code's unrelated Effect MCP/RPC patch;
- maintaining simultaneous Effect 3 and Effect 4 runtimes or a long-lived v3 compatibility facade;
- application feature, API payload, or database-model redesign;
- replacing SQLite, React, Electron, TanStack, or Astryx;
- real provider end-to-end tests in the normal test suite;
- chasing 100% coverage through meaningless assertions or broad exclusions;
- creating a shared testing package before repeated, stable cross-workspace helpers justify one. Start with package-local test layers so private implementation details do not become another shared API.

## References

Primary documentation consulted on 2026-08-13:

- [Vite+ migration guide](https://viteplus.dev/guide/migrate) — preconditions, single Vitest identity, import/config migration, and verification sequence.
- [Vite+ monorepo guide](https://viteplus.dev/guide/monorepo) and [Vite Task run guide](https://viteplus.dev/guide/run) — root defaults, package overrides, recursive dependency-aware tasks, and caching.
- [Vite+ test guide](https://viteplus.dev/guide/test), [check guide](https://viteplus.dev/guide/check), [lint guide](https://viteplus.dev/guide/lint), and [format guide](https://viteplus.dev/guide/fmt) — the intended unified command/config surface.
- [Vite+ CI guide](https://viteplus.dev/guide/ci) — exact setup action versioning and install/check/test/build workflow.
- [Vitest test projects](https://vitest.dev/guide/projects.html), [coverage guide](https://vitest.dev/guide/coverage.html), and [configuration reference](https://vitest.dev/config/) — distinct environments, isolation/parallelism, inclusion of uncovered files, and thresholds.
- [Effect v3 → v4 migration overview](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md) — lockstep package versioning, package consolidation, unstable modules, and the core migration topics. The historical `effect-smol` repository points current v4 work to the canonical Effect repository.
- [Effect v4 Schema migration guide](https://github.com/Effect-TS/effect-smol/blob/main/migration/schema.md) — mechanical, semi-automatic, manual, and removed Schema APIs plus semantic changes requiring contract tests.
- [`@effect/vitest` README](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md) — Effect 4 `it.effect`, test services, scoped resources, shared layers, property testing, and the supported Vitest range.
- [`@effect/tsgo` project](https://github.com/Effect-TS/tsgo) — TypeScript 7 integration, Effect diagnostics, and available migration/architecture checks.
- [pnpm catalogs](https://pnpm.io/catalogs) and [pnpm workspaces](https://pnpm.io/workspaces) — shared dependency constants and workspace protocol behavior.
- Read-only local reference: `/Users/maxime/workspace/sandbox/t3code`, especially its root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, root/package `vite.config.ts` files, colocated tests, and `Services`/`Layers` split. No files in that checkout were changed.
