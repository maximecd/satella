# Initial Finance Model and CRUD Plan

## Goal

Add the first finance-domain model to the engine and expose a deliberately small UI for managing and inspecting it.

The model must support:

- manually maintained custodians now, with a connector-ready synced model for later;
- multiple accounts per custodian;
- current positions and daily historical snapshots;
- cash, securities, crypto, and custom assets;
- one shared price per asset across every custodian;
- automatic market pricing for non-custom assets and manual pricing for custom assets;
- one private, single-person engine database.

Transactions are not the source of truth in this version. Current positions are authoritative, and snapshots provide history.

## Domain Vocabulary

```text
Custodian -> Account -> Position -> Asset
```

### Custodian

A custodian is the top-level place, platform, institution, or setup where assets are held. Examples include a bank, IBKR, Trade Republic, MetaMask, or another wallet application.

Every custodian has an immutable management mode:

- `manual`: its accounts and positions are maintained by the user;
- `synced`: its accounts and positions are maintained by exactly one connector and are read-only to the user.

The mode is all-or-nothing for the full custodian tree. A custodian cannot switch modes after creation.

A custodian has a normal user-editable `name`. When real custodian connectors are added later, synced custodians will also have editable connector configuration and a manual Sync action. Background custodian synchronization is not part of this version.

### Connector-readiness boundary

This plan does not add or ship any custodian connector. The initial connector registry is empty, so the application initially creates and manages manual custodians only.

The connector-related schema and domain rules exist now to avoid reshaping accounts and positions when the first connector arrives. They establish:

- the immutable `synced` custodian mode;
- one connector configuration per future synced custodian;
- stable external account and asset mappings;
- transactional connector reconciliation;
- read-only ownership of connector-managed accounts and positions;
- capability-gated UI behavior.

A synced custodian cannot be created with an arbitrary connector ID. Creation must validate the ID against the compiled connector registry; with the initial empty registry, synced creation is unavailable. Test-only fake connector output may exercise these generic boundaries, but it must not be registered or exposed as a product connector.

Yahoo Finance and CoinGecko are market-data providers, not custodian connectors. Yahoo Finance prices securities and fiat FX; CoinGecko prices crypto. They price shared assets and do not create custodians, accounts, or positions.

### Account

An account is a financial container inside a custodian, such as a PEA, CTO, checking account, savings account, or wallet account.

Accounts have no category, subtype, tax-wrapper enum, or hierarchy in the initial model. Their separate identity and name are sufficient.

Every account belongs to exactly one custodian. When a custodian naturally exposes no account subdivision, create one account named `Default` under the hood. The UI may omit that extra level when it is the only account and showing it would add no useful information.

### Position

A position is the unique relationship between one account and one asset. It stores the current quantity reported by a connector or entered by the user.

There is at most one position for a given `(account_id, asset_id)`. Lots and transactions are not represented in this version.

Quantities:

- use SQLite `REAL` and TypeScript `number`;
- may be positive, zero, or negative;
- must be finite;
- remain at zero instead of being automatically deleted, preserving their history.

### Asset

Assets are global within the engine database. Positions in different custodians reference the same asset when they represent the same economic instrument.

Initial asset classes:

| Stored class | Product label | Pricing                                |
| ------------ | ------------- | -------------------------------------- |
| `fiat`       | Cash          | Yahoo Finance FX quote                 |
| `security`   | Stocks & ETFs | Yahoo Finance quote                    |
| `crypto`     | Crypto        | CoinGecko current-price endpoint       |
| `custom`     | Manual assets | User-entered price; no provider request |

`security` intentionally groups stocks and ETFs. Do not introduce finer classifications initially.

Custodian management and asset pricing are independent. A manual custodian may contain existing fiat, security, or crypto assets and receive automatic prices for them. Only custom assets accept manually entered prices; automatically priced assets do not have a manual price override.

Cash is an asset. A checking balance of 3,200 EUR is a position with asset EUR and quantity 3,200, not a special balance column on the account.

## Currency Model

Currency has three distinct roles.

### Application reporting currency

The engine has one application-wide reporting currency used for total wealth and charts. Initially it is a configurable TypeScript default:

```ts
export const DEFAULT_REPORTING_CURRENCY = "USD" as const;
```

All consumers must access it through a small settings/configuration boundary so it can become a persisted user setting later without changing domain code.

The first domain migration seeds the USD fiat asset and its `iso_currency = USD` identifier so the default resolves through normal asset identity rather than a hardcoded database ID. Other fiat assets may be created lazily from connector or market-data results.

### Account base currency

Every account has one required base currency referencing a fiat asset. Synced connectors supply it when available. Manual account creation asks for it and defaults to the application reporting currency.

Base currency is account metadata; it does not constrain holdings. A USD account can contain EUR cash or securities priced in another currency. Custodians do not have a currency.

### Asset price currency

Every price states the fiat asset in which it is quoted:

```text
Apple price: 198 EUR
EUR price:   1.16 USD
```

The stored value is the provider's original price, not a value precomputed into the application reporting currency. The valuation engine converts through available FX prices when producing reporting-currency totals. A reporting currency has an implicit self-price of one.

## Canonical Asset Identity

IBKR Apple and Trade Republic Apple must resolve to one shared Apple asset when they are the same instrument. Different custodians and trading currencies do not create different assets.

Use strong identifiers for automatic matching:

- fiat: ISO currency code;
- securities: ISIN where available;
- crypto: chain plus contract address, or a canonical native-coin identifier;
- custom assets: their unique internal ID.

Ticker symbols and names are display metadata and are not sufficient for automatic merging.

An asset may have several identifiers so connectors and market-data providers can refer to the same record:

```text
Apple
  ISIN:          US0378331005
  Yahoo Finance: AAPL
  IBKR:          265598
```

Asset matching follows this order:

1. Reuse an existing connector mapping.
2. Match a strong global identifier.
3. Create a new asset when no safe match exists.
4. Never merge automatically using only a ticker or name.

Uncertain imports may remain separate. A merge/reconciliation UI can be added when real connector data demonstrates the need.

## Pricing Model

Custodian connectors and market-data providers have separate responsibilities:

```text
Custodian connector -> accounts and position quantities
Market-data provider -> shared asset prices
```

Implement market-data providers as Effect services with stable IDs, supported asset classes, lookup/search metadata, and a batch price operation. Keep them in the engine initially rather than introducing another package before reuse requires one.

Initial defaults are selected through replaceable TypeScript configuration:

```ts
export const DEFAULT_MARKET_DATA_PROVIDER_BY_ASSET_CLASS = {
  security: "yahoo-finance",
  crypto: "coingecko",
  fiat: "yahoo-finance",
  custom: "manual",
} as const;
```

This mapping is required for the initial implementation:

- stocks and ETFs use Yahoo Finance;
- fiat currencies use Yahoo Finance FX pairs;
- cryptoassets use CoinGecko;
- custom/manual assets use only the price entered by the user and never trigger a market-data request.

Provider selection must still flow through a registry/configuration boundary so it can become a user setting later.

### Provider integrations

Keep every provider client server-side in `apps/engine` and wrap it behind the Effect service. Provider package response types must not leak into domain or browser-safe API types. Decode and normalize every provider response into the same internal observation shape:

```ts
interface PriceObservation {
  readonly assetId: AssetId;
  readonly price: number;
  readonly currencyIso: string;
  readonly source: "yahoo-finance" | "coingecko";
  readonly observedAt: Date;
}
```

The provider boundary accepts a collection and returns independent successes or typed failures keyed by asset. One bad or unknown symbol must not discard valid observations from the same batch.

#### Yahoo Finance: stocks, ETFs, and fiat

Use the server-only `yahoo-finance2` TypeScript package. Yahoo does not offer an official developer API, so isolate this unofficial dependency in a small adapter and pin the exact tested version. Before adopting or upgrading it, verify Node 22/ESM compatibility, its runtime response validation, multi-symbol `quote` support, timeout/cancellation behavior, and access to status/rate-limit errors. If it stops meeting those requirements, replace only the adapter rather than changing domain code.

- Persist an exchange-qualified Yahoo symbol as an `asset_identifiers` entry for every Yahoo-priced security. ISIN remains the canonical strong identity; the Yahoo symbol is the provider lookup key.
- Fetch current stock and ETF prices with one multi-symbol `quote([...])` call per chunk. Request only the fields needed to derive symbol, regular-market price, quote currency, quote type, and market timestamp.
- Accept only the expected security quote types, a finite positive price, a resolvable ISO fiat quote currency, and a provider timestamp. A missing item is an asset-level failure, not a zero price.
- Price fiat `FROM` in fiat `TO` with Yahoo's `FROMTO=X` symbol convention. For example, `EURUSD=X` stores the number of USD per EUR with `currency_asset_id` pointing to USD. Validate the returned symbol, currency, finite positive rate, and timestamp before storing it.
- Use the application reporting currency as `TO` for the initial FX refresh. Its self-price is implicitly one and must not cause a network request. Refresh every other fiat required by a held cash position, account base currency, or automatic asset quote currency.
- Put security symbols and already-known FX symbols into the same Yahoo multi-symbol quote request whenever the client/API supports it. A newly discovered security quote currency may require one follow-up FX batch in that refresh run; never issue one follow-up request per asset.
- Use Yahoo search only to help the user select a security. Selecting a search result must persist its exact Yahoo symbol and available strong identity; never infer an exchange from a bare ticker.

#### CoinGecko: crypto

Prefer CoinGecko's official server-side TypeScript SDK, `@coingecko/coingecko-typescript`, pinned to an exact tested version. Adopt it only if a short integration spike confirms Node 22/ESM support, typed access to the required batch endpoints, timeout/cancellation, and usable error/rate-limit metadata. If the official SDK fails that quality gate, use the existing Effect HTTP client directly against CoinGecko's documented REST API rather than choosing an unmaintained wrapper.

- Persist the CoinGecko coin ID as a provider-specific `asset_identifiers` entry. It is the lookup key for listed/native coins; name and symbol are never lookup identities.
- Batch listed/native coins through `/simple/price`, passing all deduplicated CoinGecko IDs for the chunk and the application reporting currency as the requested `vs_currency`. Validate that currency against a cached `/simple/supported_vs_currencies` result; if it is unsupported, request USD once for the batch, store the USD quote, and let the normal Yahoo FX path convert it for reporting.
- For a contract-address asset that has no CoinGecko coin ID, group requests by CoinGecko asset-platform/chain ID and use `/simple/token_price/{platform}` with all contract addresses for that platform in one call. Persist a returned CoinGecko ID when resolution supplies one.
- Request only current price and last-updated time. Validate that each returned value is finite and positive and use CoinGecko's last-updated timestamp as `observed_at`; a missing coin remains unpriced.
- Use CoinGecko search/metadata endpoints when selecting or resolving a cryptoasset, but cache slowly changing provider ID/platform metadata separately from current prices.

#### Request efficiency and resilience

`MarketDataService.refreshPrices` is the only coordinator that performs automatic price fetching. Reads of assets, positions, and totals only read persisted `asset_prices`; rendering a screen must never create provider traffic.

For every refresh run:

1. Load the referenced automatic assets once and deduplicate them by provider lookup key, not by position. Ten positions holding Apple therefore produce one `AAPL` lookup.
2. Remove assets whose persisted observation is still inside the centrally configured freshness window unless the caller explicitly requires a fresh snapshot observation.
3. Partition requests by provider and native batch shape: one Yahoo symbol collection, one CoinGecko ID collection, and at most one CoinGecko contract collection per platform.
4. Split only when a provider's documented/request-size limit requires it. Keep chunk sizes in provider configuration rather than scattering magic constants through callers.
5. Run the independent Yahoo and CoinGecko batches concurrently with bounded concurrency. Also bound concurrent chunks; do not launch an unbounded `Promise.all` and do not fall back to one request per asset.
6. Coalesce concurrent refreshes for the same provider/lookup key (single-flight) so startup, a manual refresh, and the snapshot scheduler cannot duplicate the same outbound work.
7. Upsert all valid observations in one database transaction after normalization. Return per-asset failures and retain each failed asset's last known observation unchanged.

Apply a provider timeout and a small bounded retry policy only to transient network failures, `429`, and `5xx` responses. Honor `Retry-After` when present and otherwise use exponential backoff with jitter. Do not retry invalid symbols or other permanent `4xx` responses. Record structured diagnostics containing provider, batch size, duration, attempt count, and failure category, but never API keys or full credential-bearing URLs.

Search calls use a separate short-lived query cache, request cancellation, a minimum useful query length, and UI debouncing. Current-price calls use the persisted observation timestamp plus the freshness window. Provider API keys and plan-specific base URLs are engine configuration/secrets and are never sent to the web application.

Use these replaceable initial policy defaults rather than embedding timing or concurrency values in adapters:

```ts
export const DEFAULT_MARKET_DATA_POLICY = {
  priceFreshness: Duration.minutes(5),
  requestTimeout: Duration.seconds(10),
  maxAttempts: 3,
  maxConcurrentBatchesPerProvider: 2,
  searchDebounceMs: 300,
} as const;
```

Provider-specific batch limits and request budgets remain separate configuration. CoinGecko currently documents at most 515 IDs or contract addresses per simple-price request; use a conservative configured chunk size no larger than the active plan/API limit and request `include_last_updated_at=true`. Verify limits during the package spike instead of assuming that they are permanent. For Yahoo, choose the largest multi-symbol chunk proven reliable by the adapter integration tests and reduce it through configuration if Yahoo starts rejecting request size or rate.

Default automated tests must use injected fake clients and recorded, sanitized response fixtures; they must not consume live provider quotas or depend on the network. Keep optional credential-gated smoke tests separate from the normal test command so the package/API compatibility spike can be repeated deliberately.

Market-data integration references:

- [Yahoo Finance 2 repository and server-side TypeScript usage](https://github.com/gadicc/yahoo-finance2)
- [CoinGecko official TypeScript SDK](https://docs.coingecko.com/docs/sdk-typescript)
- [CoinGecko batch price by coin ID](https://docs.coingecko.com/reference/simple-price)
- [CoinGecko batch price by contract address](https://docs.coingecko.com/reference/simple-token-price)

Each asset has at most one selected current price. That one price values every position referencing the asset, producing consistent cross-custodian statistics. A connector-reported price may be used as a shared fallback observation, but it is never attached exclusively to one position.

Price priority:

1. The configured market-data provider for the asset class.
2. A custodian-reported price as a shared fallback.
3. A user-entered price for custom assets only.

When no price is available:

- importing or editing the position still succeeds;
- the position is omitted from valued totals rather than treated as zero;
- the UI places it in a collapsed `Unpriced positions` section;
- the UI indicates that the visible total is incomplete.

When refresh fails but a last known price exists, retain it with its original observation timestamp and surface that it is stale.

Prices use SQLite `REAL` and TypeScript `number`. They must be finite. User-facing monetary totals are rounded for their display currency, and calculated floating-point values must not be compared for exact equality.

## Proposed SQLite Schema

Use strict SQLite tables, foreign-key enforcement, UTC timestamps, and database-level uniqueness and cascade rules. The exact timestamp representation can follow the persistence layer convention, but it must be consistent across all tables.

### `custodians`

```text
id                primary key
name              text, required
management_mode   text, required, manual | synced
created_at        timestamp, required
updated_at        timestamp, required
```

Rules:

- `management_mode` is immutable.
- Names need not be globally unique.
- There is no archive or soft-delete column.

### `custodian_connectors`

```text
custodian_id      primary key, FK -> custodians, cascade delete
connector_id      text, required
config_json       text, required
last_synced_at    timestamp, optional
created_at        timestamp, required
updated_at        timestamp, required
```

Rules:

- Exactly one row exists for every synced custodian.
- No row exists for a manual custodian.
- Connector configuration is runtime-validated by that connector's Effect Schema.
- Do not store credentials or tokens in plaintext `config_json`. Real sensitive connector use remains blocked on the vault and at-rest encryption design from the SQLite persistence plan.

### `accounts`

```text
id                        primary key
custodian_id              FK -> custodians, required, cascade delete
name                      text, required
base_currency_asset_id    FK -> assets, required
connector_account_id      text, optional
created_at                timestamp, required
updated_at                timestamp, required
```

Constraints and domain validation:

- `(custodian_id, connector_account_id)` is unique when a connector ID exists.
- Manual accounts have no `connector_account_id`.
- Synced accounts require a `connector_account_id` supplied by their connector.
- `base_currency_asset_id` must reference a fiat asset.
- Accounts have no initial type/category column.

The connector account ID is the stable upstream identity used to upsert the same account across syncs even when its name changes.

### `assets`

```text
id                primary key
asset_class       text, required, fiat | security | crypto | custom
name              text, required
symbol            text, optional
created_at        timestamp, required
updated_at        timestamp, required
```

Symbols and names are not unique.

### `asset_identifiers`

```text
id                primary key
asset_id          FK -> assets, required, cascade delete
identifier_type   text, required
identifier_value  text, required
```

`(identifier_type, identifier_value)` is globally unique. Provider-specific namespaces must include enough scope to make values stable, such as an exchange-qualified Yahoo Finance symbol rather than assuming every bare ticker is global.

### `connector_asset_mappings`

```text
custodian_id       FK -> custodians, required, cascade delete
external_asset_id  text, required
asset_id           FK -> assets, required
```

Use `(custodian_id, external_asset_id)` as the primary or unique key. This preserves the local mapping even when a connector's identifier is meaningful only within that connector or configured custodian.

### `positions`

```text
id                primary key
account_id        FK -> accounts, required, cascade delete
asset_id          FK -> assets, required
quantity          REAL, required
created_at        timestamp, required
updated_at        timestamp, required
```

Constraints:

- `(account_id, asset_id)` is unique.
- Quantity must be finite and may be negative, zero, or positive.
- A normal close/removal updates quantity to zero rather than deleting the row.
- An explicit permanent delete removes the position and its history.

### `asset_prices`

```text
asset_id           primary key, FK -> assets, cascade delete
price              REAL, required
currency_asset_id  FK -> assets, required
source              text, required
observed_at         timestamp, required
updated_at          timestamp, required
```

Rules:

- `currency_asset_id` must reference a fiat asset.
- Price must be finite.
- One row is the selected current shared price for the asset.
- `source` is a stable market-data provider ID, connector fallback ID, or `manual` for custom assets.

### `snapshots`

```text
id                primary key
captured_at       timestamp, required, unique
```

This row identifies one complete, successful snapshot run. It provides a reliable due-check timestamp even when the database contains no positions and groups quantities and prices captured in the same transaction.

### `position_snapshots`

```text
snapshot_id       FK -> snapshots, required, cascade delete
position_id       FK -> positions, required, cascade delete
quantity          REAL, required
```

Use `(snapshot_id, position_id)` as the primary or unique key.

### `asset_price_snapshots`

```text
snapshot_id        FK -> snapshots, required, cascade delete
asset_id           FK -> assets, required, cascade delete
price              REAL, required
currency_asset_id  FK -> assets, required
source              text, required
observed_at         timestamp, required
```

Use `(snapshot_id, asset_id)` as the primary or unique key.

## Snapshot Workflow

Daily is the initial snapshot interval, expressed as replaceable engine configuration rather than encoded in the schema:

```ts
export const DEFAULT_SNAPSHOT_INTERVAL = Duration.days(1);
```

The snapshot job:

1. Checks whether the configured interval has elapsed since the latest successful snapshot.
2. Gives all referenced fiat, security, and crypto assets to the shared refresh coordinator in one run. The coordinator deduplicates and batches Yahoo securities/FX and CoinGecko crypto requests as specified above; it does not loop over positions and fetch one-by-one.
3. Retains last known prices when an individual provider refresh fails.
4. Creates one snapshot-run row.
5. Inserts current quantities for all positions, including zero positions, under that snapshot ID.
6. Inserts the selected current price for every priced, referenced asset under the same snapshot ID.
7. Commits the complete snapshot atomically so quantities and prices represent one capture, or rolls all of it back.

Custom prices are not automatically refreshed. The latest manual custom price is included in the snapshot.

The engine may run the due check on startup and periodically while alive. It must not fabricate missed daily snapshots for periods when it had no observations. This job does not synchronize custodian accounts or quantities.

Historical valuation uses the position quantity and shared asset price captured at the relevant snapshot, converting through the captured FX prices into the requested reporting currency.

## Manual Custodian Workflow

1. Create a custodian with `management_mode = manual` and a name.
2. Create its first account, choosing a base currency defaulted from the application reporting currency. The UI may create a `Default` account automatically for wallet-like custodians.
3. Add a position by selecting an existing asset or creating a custom asset.
4. Enter the position quantity.
5. For fiat and securities, enqueue a Yahoo Finance refresh; for crypto, enqueue a CoinGecko refresh. Coalesce it with any refresh already in flight and use the normal batch/cache policy rather than issuing an unconditional request from the route handler.
6. For a custom asset, request a user-entered price and its fiat currency while still allowing the position to exist unpriced. Never call Yahoo Finance or CoinGecko for a custom asset.
7. Updating a holding changes the current quantity; setting it to zero preserves its snapshots.

## Future Synced Custodian Workflow

This workflow specifies the generic behavior that becomes active when a separately scoped real custodian connector is added. No production connector implements it in the initial version.

1. Create a custodian with `management_mode = synced`, one connector ID, and validated configuration.
2. Run synchronization only when the user explicitly requests it.
3. Inside one transaction, upsert accounts by `(custodian_id, connector_account_id)`.
4. Resolve connector instruments through connector mappings and strong asset identifiers.
5. Upsert current positions by `(account_id, asset_id)`.
6. After a successful complete sync, set previously known but now missing positions to zero.
7. Never reconcile destructive absence from a failed or partial connector result.
8. Refresh shared automatic prices independently through market-data providers.

Accounts and positions under a synced custodian are read-only in the UI and write-protected in engine domain services. The user may edit the custodian name and connector configuration, manually trigger sync, or permanently delete the custodian.

If a connector explicitly removes an account, or a successful complete reconciliation determines that it is gone, hard-delete the account and its dependent positions and snapshots. There is no archived state.

## Deletion and Privacy Semantics

There are no `archived_at`, `deleted_at`, tombstone, or soft-delete fields.

- Deleting a custodian permanently cascades to its connector configuration, connector mappings, accounts, positions, and position snapshots.
- Deleting an account permanently cascades to its positions and position snapshots.
- Explicitly deleting a position permanently deletes its snapshots.
- Setting a position quantity to zero is a normal historical state and is distinct from permanent deletion.
- Deleting an asset is allowed only when no account or position still references it; its identifiers and price history then cascade.
- Global asset records do not cascade from deleting one custodian because another custodian may share them.

Hard deletion is the application-level semantic. Physical erasure from SQLite pages, WAL files, migration backups, exports, and filesystem backups is a separate encryption/secure-storage concern and must be handled by the privacy design before real financial data is persisted.

## Single-Person Boundary

One engine database belongs to one person.

Do not add:

- users;
- households;
- organizations;
- ownership foreign keys on finance tables;
- an authentication model as part of this schema.

Remote engine access and process authentication are separate concerns outside this plan.

## UI Implementation Plan

Treat the initial frontend as a separate, deliberately simple CRUD workstream. Its purpose is to exercise the domain model and API, not establish an advanced wealth dashboard.

### UI constraints

- Use the Astryx design system already installed in the web application for components, tokens, theme, accessibility, and common layouts.
- Prefer Astryx `AppShell`, layout, navigation, breadcrumbs, table/list, form, button, collapsible, empty-state, toast, and alert-dialog primitives where they fit.
- Use StyleX only for small product-specific layout needs such as page width, spacing, and responsive stacking, using Astryx tokens.
- Do not build a competing component library, custom design system, charting layer, elaborate animations, or highly polished dashboard in this phase.
- Keep each screen easy to understand: a heading, one primary action, a list or form, and explicit loading, empty, error, and read-only states.
- Prefer full routes for create/edit/detail workflows instead of coordinating many dialogs or complicated local state. Use an Astryx alert dialog only to confirm destructive deletion.

### Frontend dependencies and setup

Add the planned React integrations to `apps/web`:

- TanStack Router with its Vite plugin and file-based routes;
- TanStack Query for all engine reads and mutations;
- TanStack Form for form state and validation.

Keep the existing Astryx reset, theme, `LayerProvider`, and StyleX setup. Add one application `QueryClient` and provide it at the root alongside the generated TanStack Router.

The frontend calls typed, browser-safe engine API operations. It never imports engine repositories, runtime layers, SQL modules, or Node-specific code.

### Initial routes

Use simple file-based routes with typed path parameters:

| Route                                   | Purpose                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/`                                     | Redirect to or render the custodian list                                                              |
| `/custodians`                           | List custodians and their management modes                                                            |
| `/custodians/new`                       | Create a manual custodian; expose synced creation later only when the connector registry is non-empty |
| `/custodians/$custodianId`              | Show custodian details and accounts                                                                   |
| `/custodians/$custodianId/edit`         | Rename the custodian and, when synced, edit connector configuration                                   |
| `/custodians/$custodianId/accounts/new` | Create an account for a manual custodian                                                              |
| `/accounts/$accountId`                  | Show account details and positions                                                                    |
| `/accounts/$accountId/edit`             | Rename a manual account and change its base currency                                                  |
| `/accounts/$accountId/positions/new`    | Add an existing asset or create a custom asset position                                               |
| `/positions/$positionId/edit`           | Change quantity for a manual position; custom-asset pricing may be included when applicable           |
| `/assets`                               | Inspect/search the shared asset catalog                                                               |
| `/assets/custom/new`                    | Create a custom asset and optional initial manual price                                               |
| `/assets/$assetId/edit`                 | Edit a custom asset and its manual price; automatic assets are read-only                              |

Do not introduce nested overlays, route masking, or route-loader orchestration initially. Route components may compose small feature components, but they remain the obvious owner of their screen.

### TanStack Query conventions

Every engine GET request from a React screen uses `useQuery`. Do not duplicate server data into component state or a second client-side store.

Define query keys and reusable `queryOptions` centrally by resource:

```text
custodians.all
custodians.detail(custodianId)
connectors.capabilities
accounts.detail(accountId)
assets.all(search?)
assets.detail(assetId)
```

Rules:

- Query functions call the typed engine client and return schema-decoded responses.
- Route components render explicit pending, error, empty, and success states using Astryx.
- Avoid polling. Custodian synchronization is a user-triggered mutation.
- Do not add optimistic updates initially. The local engine should respond quickly, and invalidation is easier to reason about for destructive finance operations.
- Keep stale-time and retry choices conservative and centralized rather than overriding them on every component.

Use `useMutation` for every available write operation:

- create, update, and delete custodians;
- when a real connector exists, update connector configuration and run `Sync now`;
- create, update, and delete manual accounts;
- create, update, zero, and permanently delete manual positions;
- create, update, price, and delete custom assets.

After success, await invalidation of the narrow affected keys. For example, creating an account invalidates that custodian detail; changing a position invalidates its account, custodian totals, and any shared portfolio summary. In the future, a successful manual connector sync will invalidate the synced custodian, its accounts/positions, and affected asset/price queries.

Use mutation state for submit-button pending state and duplicate-submit prevention. Display expected API failures near the form or action and use Astryx toasts for concise success/failure feedback. Keep hard-delete confirmations explicit and do not apply optimistic deletion.

### TanStack Form and Effect Schema integration

Use TanStack Form rather than bespoke `useState` form handling. Define form/API input schemas in the engine's browser-safe API contract so the web application and engine share one source of truth.

The installed `effect@3.22.1` provides `Schema.standardSchemaV1`, and TanStack Form accepts Standard Schema validators, including Effect Schema. Use that direct integration rather than introducing Zod or maintaining duplicate client schemas.

The intended type flow is:

```text
Effect Schema encoded/input type
  -> TanStack Form values and deeply typed field paths
  -> Schema.standardSchemaV1(schema) for form validation and field issues
  -> explicit Effect Schema decode on submit
  -> decoded API command type
  -> useMutation
  -> engine validates the same API schema again
```

This distinction matters for transformed schemas. For example, a quantity input may be represented by a string in an HTML field and decoded to a number for the API:

```ts
const UpdatePositionInput = Schema.Struct({
  quantity: Schema.NumberFromString,
});

const UpdatePositionFormValidator = Schema.standardSchemaV1(UpdatePositionInput);

type UpdatePositionFormValues = typeof UpdatePositionInput.Encoded;
type UpdatePositionCommand = typeof UpdatePositionInput.Type;
```

TanStack Form's Standard Schema validation reports validation issues and paths but does not replace form values with a schema's transformed output. Therefore:

1. Keep TanStack Form default values aligned with the schema's encoded/input type.
2. Pass the Standard Schema wrapper as the form-level validator so nested issue paths map to fields.
3. On submit, explicitly decode the form value with the original Effect Schema.
4. Only pass the decoded output type to `mutation.mutate` or `mutation.mutateAsync`.
5. Decode and validate again at the engine HTTP boundary; browser validation is user feedback, not a trust boundary.

API input schemas used by forms must be browser-safe and context-free (`R = never`) so Standard Schema validation can execute in the renderer. Keep network/database-dependent checks in the mutation endpoint and return typed domain failures; do not hide remote checks in field schemas.

Create one small application form binding with TanStack Form's `createFormHook` and Astryx-backed field components for the controls actually needed:

- text input;
- number input while preserving the schema's encoded type;
- selector;
- field label/status/errors;
- submit button.

This binding should remove repetitive wiring while preserving TanStack Form's inferred nested field names. Do not build a generic schema-generated form engine. Forms remain explicit route components composed from a few Astryx-backed fields.

Before converting every form, implement and typecheck one representative vertical slice—create custodian plus a transformed numeric position form—to verify:

- deeply inferred field names;
- optional field behavior under the repository's `exactOptionalPropertyTypes` setting;
- Effect issue paths rendering under the corresponding Astryx fields;
- encoded string to decoded number transformation at submit;
- decoded values flowing into a typed `useMutation` without casts or `any`.

If that spike exposes a library compatibility problem, keep Effect Schema as the canonical API schema and write a small typed validator adapter. Do not solve it by duplicating schemas in another validation library.

### Custodian screens

The custodian list:

- shows every custodian by `name` and management mode;
- links each row to its detail route;
- links to the create route;
- uses an Astryx empty state when none exist.

Custodian create/edit/detail routes support:

- creating a manual custodian;
- renaming either kind of custodian;
- permanently deleting a custodian after confirmation;
- listing its accounts and their base currencies;
- creating accounts only when the custodian is manual;
- visually omitting or collapsing a sole `Default` account when that makes a wallet-like custodian easier to understand.

Also query the engine's connector capabilities. While the registry is empty, do not render synced creation, connector configuration, or `Sync now` controls. When the first real connector is registered later, the same routes may additionally support:

- creating a synced custodian by selecting a registered connector and entering its validated configuration;
- editing connector configuration;
- triggering `Sync now` through `useMutation`;
- rendering connector-owned accounts read-only.

### Account and position screens

Account detail lists positions with asset name, symbol, quantity, selected shared price, price currency, reporting-currency value, and price timestamp.

For manual accounts:

- add an existing asset or create a custom asset;
- change a position quantity;
- set quantity to zero while retaining history;
- permanently delete a position;
- rename or permanently delete the account;
- change the account base currency.

For synced accounts, every connector-owned account and position field is visibly read-only.

Use Astryx collapsibles for:

- zero-quantity positions in `Zero positions`;
- unpriced positions in `Unpriced positions`.

Unpriced positions are excluded from the displayed valued total. Clearly indicate when the visible total is incomplete or relies on stale prices.

### Asset screens

- Search/select stocks and ETFs through Yahoo Finance and cryptoassets through CoinGecko. Fiat selection uses ISO currencies supported by the Yahoo FX adapter; custom assets are created locally.
- Inspect strong identifiers and selected price-source metadata for diagnosis.
- Do not make provider-owned identifiers or automatic prices editable.
- Create, rename, manually price, and permanently delete custom assets.
- Permit manual price editing only for custom assets.

### UI verification and acceptance

Test route-level behavior with a real Query Client and mocked typed API boundary. Cover:

- every GET screen loading through `useQuery`;
- every write using `useMutation` and invalidating the expected query keys;
- manual CRUD controls appearing only where writes are allowed;
- an empty connector registry hiding all synced setup and sync controls;
- test-only synced fixtures proving accounts and positions remain read-only;
- a registered test capability revealing connector configuration and manual Sync controls without shipping a production connector;
- hard-delete confirmations and the absence of optimistic deletion;
- zero and unpriced position collapsibles;
- incomplete and stale valuation states;
- Effect Schema issue paths appearing on the correct fields;
- transformed form inputs being explicitly decoded before mutation;
- route navigation after successful create/delete operations.

The UI work is complete when every initial entity can be reached through a predictable route, manual data can be managed without raw API calls, synced data can be inspected and manually refreshed, and no screen requires a custom design-system primitive.

### UI research references

- [TanStack Router file-based routing](https://tanstack.com/router/latest/docs/routing/file-based-routing)
- [TanStack Query `useQuery`](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
- [TanStack Query mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)
- [TanStack Query invalidation from mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)
- [TanStack Form quick start and `createFormHook`](https://tanstack.com/form/latest/docs/framework/react/quick-start)
- [TanStack Form Standard Schema validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation#standard-schema-libraries)

## Engine Service Boundaries

Keep HTTP handlers thin and enforce invariants in domain services/repositories:

- `CustodianService`: create, rename, delete, validate immutable mode and registered connector IDs, update connector config, trigger sync;
- `AccountService`: manual CRUD, connector upsert, base-currency validation;
- `AssetService`: canonical matching, identifier management, custom-asset CRUD;
- `PositionService`: manual quantity updates, connector reconciliation, permanent deletion;
- `MarketDataService`: provider registry, Yahoo/CoinGecko asset search, deduplication, freshness filtering, batch planning, bounded concurrency, single-flight refresh, retry/rate-limit handling, response normalization, and fallback selection;
- `SnapshotService`: due check, price refresh, and atomic daily capture.

Connectors never write the database directly. They return normalized data; the engine resolves identities and commits it transactionally.

## Implementation Order

1. Complete the SQLite infrastructure plan and encryption/vault prerequisite needed before real financial data.
2. Add the first domain migration with custodians, accounts, assets, identifiers, connector mappings, positions, current prices, and snapshot tables; seed the canonical USD fiat asset.
3. Implement persistence schemas and repositories with foreign keys, uniqueness, `REAL` validation, and cascade tests.
4. Implement custodian and account domain services, including immutable management mode and hard deletion.
5. Implement asset identity matching and manual/custom asset handling.
6. Implement manual position CRUD and shared valuation in the reporting currency.
7. Add the market-data provider interface and registry. Spike and pin `yahoo-finance2` and CoinGecko's official TypeScript SDK against the quality gates above; then implement Yahoo Finance for securities plus fiat FX, CoinGecko for crypto, and the local manual-price path for custom assets. Add the shared batching/cache/single-flight coordinator before wiring refresh entry points.
8. Implement the configurable daily snapshot job with price refresh and atomic capture.
9. Define and test the generic connector ingestion/reconciliation boundary with test-only normalized fixture output; keep the production connector registry empty.
10. Add typed HTTP operations, including an empty connector-capabilities query, then build the route-based Astryx CRUD UI with TanStack Router, Query, Form, and the Effect Schema form-validation spike.

## Verification

Cover at least these cases with engine integration tests against temporary SQLite databases:

1. A manual custodian can contain several accounts and each account requires a fiat base currency.
2. A synced custodian requires exactly one connector configuration and its mode cannot change.
3. Manual and synced account write permissions are enforced in the engine, not only the UI.
4. Connector account IDs are stable and unique within a custodian.
5. The same strongly identified Apple asset is reused by IBKR and Trade Republic positions.
6. Names and tickers alone do not automatically merge assets.
7. An account cannot have duplicate positions for the same asset.
8. Positive, zero, and negative finite quantities persist; invalid non-finite values are rejected.
9. Cash is held as a fiat-asset position and accounts can hold currencies other than their base currency.
10. One shared asset price values positions consistently across multiple custodians.
11. Automatic assets reject manual price edits; custom assets accept them.
12. Missing prices do not block imports and are excluded from valued totals with an incomplete-result marker.
13. Failed refreshes retain stale last-known prices and observation timestamps.
14. A daily snapshot refreshes prices first and atomically captures quantities and selected prices.
15. Missing synced positions become zero only after a successful complete sync.
16. Deleting custodians, accounts, positions, and unreferenced assets performs the documented hard cascades.
17. Historical quantities and prices produce reporting-currency values using historical FX observations.
18. Several positions sharing one Yahoo symbol or CoinGecko ID cause only one provider lookup in a refresh run.
19. Securities and required fiat pairs share the fewest possible Yahoo batch calls, while CoinGecko IDs and same-platform contract addresses are batched up to configured provider limits.
20. Yahoo and CoinGecko batches run with bounded concurrency; simultaneous refresh triggers are coalesced and never create an unbounded request fan-out.
21. Fresh observations are reused for normal refreshes, while a due snapshot can request a fresh provider observation; reading totals or opening UI routes never calls a provider.
22. Partial batch success persists valid observations, reports failures by asset, and keeps last-known prices for failed assets.
23. `429` and transient failures honor the bounded retry policy, permanent failures are not retried, and custom assets produce zero outbound provider requests.
24. Yahoo FX direction is correct: `EURUSD=X` is stored as units of USD per EUR, and the reporting currency causes no self-rate request.
25. Provider responses with missing timestamps, unknown quote currencies, non-finite/non-positive prices, mismatched symbols, or wrong Yahoo quote types are rejected without corrupting the prior observation.

Frontend verification is specified separately in the UI implementation section.

## Explicitly Deferred

- Transactions as a ledger or source of truth
- Cost basis and tax calculations
- Account categories, account types, and tax-wrapper models
- Every real custodian connector implementation
- Activating synced-custodian creation and Sync UI until a real connector is registered
- Automatic/background custodian synchronization
- User-configured snapshot interval
- Persisted reporting-currency and market-data-provider settings
- User-selected market-data provider overrides
- Asset merge/reconciliation UI
- Multi-person, household, or organization ownership
- Authentication and remote-access design
- Exact-decimal or fixed-point migration unless accounting-grade precision requires it
- Advanced dashboards and portfolio visualization beyond the starter CRUD views

## Acceptance Criteria

- Every account belongs to one custodian and every position belongs to one account and one global asset.
- A custodian is permanently manual or synced, and synced account/position data is read-only.
- Cash, securities, crypto, and custom assets share the same position model.
- Stocks and ETFs are fetched from Yahoo Finance, fiat values are fetched from Yahoo Finance FX pairs, crypto prices are fetched from CoinGecko, and manual assets are priced only by the user.
- IBKR and Trade Republic can hold the same canonical Apple asset without receiving position-specific portfolio prices.
- Every valued asset has one selected shared price with an explicit fiat currency and observation timestamp.
- Current wealth and daily history can be calculated without transactions.
- Missing prices never block synchronization and never silently count as zero.
- Daily snapshots refresh automatic prices before atomically recording quantities and prices.
- Automatic refreshes deduplicate shared assets, use provider-native batch endpoints, cache fresh observations, coalesce overlapping work, and apply bounded concurrency and retry behavior instead of issuing one request per position.
- Custodian sync happens only through an explicit user action.
- Financial records use hard deletion rather than archival.
- The initial UI can create and manage manual data and expose zero/unpriced positions.
- The empty connector registry keeps synced creation and sync controls unavailable while the schema, generic ingestion boundary, and read-only UI states remain ready for a future connector.
- The schema contains no user, household, authentication, account-category, or soft-delete abstractions.
