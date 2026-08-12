# Add Assets and Dashboard UX Plan

## Goal

Replace the current Custodian-first UI with a Dashboard-first experience centered on one route-backed **Add assets** modal. Preserve the existing Custodian → Account → Position domain hierarchy, but reveal it only when it is natural to the task.

This phase should make adding and finding accounts substantially easier without attempting the later redesign of individual holding presentation.

## Agreed Product Decisions

### Primary experience

- `/` becomes the Dashboard rather than redirecting to `/custodians`.
- The Dashboard has a primary **Add assets** button.
- The modal title is also **Add assets**.
- The Dashboard initially shows a flattened account overview. Custodians are secondary context, not a required drill-down.
- Adding an asset completes by closing the modal, returning to the Dashboard, refreshing its data, and showing a contextual success toast.

### First-step categories

The searchable first step contains:

1. **Stocks & ETFs**
2. **Crypto**
3. **Current accounts**
4. **Savings accounts**
5. **Other assets**

These are user intents, not a second domain taxonomy. Their domain mappings are:

| User choice | Asset class used for connector discovery | Manual account kind |
| --- | --- | --- |
| Stocks & ETFs | `security` | `securities` |
| Crypto | `crypto` | `crypto` |
| Current accounts | `fiat` | `current` |
| Savings accounts | `fiat` | `savings` |
| Other assets | `custom` | System-managed only |

FX is out of scope.

### Connector discovery

- Every connector declares an array of compatible asset classes.
- IBKR declares `security`; OKX declares `crypto`.
- Connector lists are strictly filtered using the selected category's asset class.
- **Add manually** is always available after compatible connectors.
- If a category has no compatible connector, skip the connector step and enter its manual flow directly.
- Compatibility affects discovery only. Once connected, import every valid account and position returned by the connector, even if their classes differ from the entry category. For example, IBKR selected through Stocks & ETFs may still import crypto.
- Allow several connections using the same connector. Prefill provider-derived names and disambiguate suggestions such as `IBKR 2`, while keeping the field editable.
- Connector submission authenticates and imports immediately. There is no preview or selective-import step in this phase.
- Keep connector failures inline and preserve the entered form state. Never put credentials in route params, search params, logs, or persisted wizard drafts.

### Manual Custodians and Accounts

- Keep Custodians entirely manual or entirely synced. Do not introduce mixed ownership.
- Exclude every synced Custodian and Account from manual destination pickers.
- All manual Custodians are reusable across categories. A bank created for a current account can later contain a PEA or crypto account.
- Allow manual and synced Custodians to share the same name. Management surfaces distinguish them using **Manual** and **Connected** source labels; never merge them automatically.
- Use contextual terminology instead of exposing a universal `Custodian` label:
  - Stocks & ETFs: **Choose a bank or broker**
  - Crypto: **Choose a platform or wallet**
  - Current/Savings: **Choose a bank**
  - Settings umbrella: **Institutions & wallets**
- The flow chooses a Custodian first and then an Account. Do not collapse both into one picker.
- Stocks/Crypto Account pickers use strict kind filtering, while Current/Savings creation stamps the kind selected on the first screen:
  - Stocks & ETFs show only manual `securities` accounts.
  - Crypto shows only manual `crypto` accounts.
- A required inline account name starts empty and uses the neutral placeholder **Account name**.
- New securities/crypto accounts also ask for base currency, defaulted to the application's reporting currency and editable by the user. A Current/Savings Account instead uses the selected balance currency as its base currency.

### Manual Stocks & ETFs

1. Search the existing provider-backed security catalog.
2. Select a result. Custom stocks are not allowed.
3. Choose or create a manual bank/broker.
4. Choose or create a `securities` Account beneath that Custodian. The Account is mandatory and is never created or selected silently; examples include `Compte-titres` and `PEA`.
5. Enter the current quantity.

If the same security already exists in the selected Account, prefill its current quantity and submit as **Update quantity**. Quantity is always an absolute current balance, never an increment.

### Manual Crypto

Use the same flow as Stocks & ETFs, with these contextual differences:

- Search only the provider-backed crypto catalog; custom crypto is not allowed.
- Choose or create a platform/wallet Custodian.
- Choose or create a `crypto` Account.
- Enter the absolute current quantity.

### Manual Current and Savings Accounts

Current and Savings entries create the financial account itself; they do not place cash inside another user-visible Account.

1. Choose or create a manual bank.
2. Enter a new Account name.
3. Choose any supported fiat currency.
4. Enter the current **Balance**.

The category supplies the `current` or `savings` Account kind. The engine represents the balance as a fiat Position whose quantity is the entered balance. Each Add assets run creates a new Account; later balance changes happen from that Account's editing experience.

### Other assets

Other assets are the only way to create a custom Asset.

The form asks only for:

- Asset name
- Current value
- Currency

It does not ask for a Custodian, Account, or location. The engine creates a custom Asset, gives it a manual price, and stores a quantity of `1` in an explicit system-managed direct-ownership Custodian/Account. Identify those system records through immutable role metadata, never through their display names. Hide them from normal Custodian and Account pickers.

## Domain and Persistence Changes

### Account kind

Add `AccountKind` to the engine contract and database:

```ts
type AccountKind = "current" | "savings" | "securities" | "crypto" | "other"
```

- Add a non-null `account_kind` column through migration `0004` and a database check constraint.
- Add the field to `Account`, `AccountSummary`, `CreateAccountInput`, relevant update inputs, and connector account output.
- Set IBKR accounts to `securities` and OKX accounts to `crypto`. This does not constrain the assets a connector may return.
- Have future bank connectors report `current` or `savings` per imported Account.
- Backfill existing synced accounts from their connector (`ibkr` → `securities`, `okx` → `crypto`).
- Backfill legacy manual accounts conservatively from their position composition: securities plus cash → `securities`, crypto plus cash → `crypto`, fiat-only → `current`, and ambiguous/custom/mixed accounts → `other`.
- `other` is a safe legacy/debug classification and is not offered by the new Stocks, Crypto, Current, or Savings pickers.

Keep `management_mode` at the Custodian level. Do not permit manual Accounts under a synced Custodian, and do not change connector reconciliation ownership.

### Connector capability metadata

Extend the connector interface and public `ConnectorCapability` with:

```ts
readonly assetClasses: ReadonlyArray<ConnectorAssetClass>
```

- Validate that built-in connectors declare at least one supported discovery class.
- Add `assetClasses: ["security"]` to IBKR and `assetClasses: ["crypto"]` to OKX.
- Preserve all imported output after selection; do not add class filtering to normalization or reconciliation.
- Add connector registry and API contract tests for the new metadata.

### Manual workflow operations

Add use-case-level service operations rather than making the web client coordinate several unrelated writes:

- Upsert an absolute manual security/crypto quantity in an existing compatible Account.
- Create a manual Custodian and typed Account together when both are entered inline.
- Create a Current/Savings Account and its fiat balance atomically.
- Create an Other Asset, its manual price, its system-owned destination records, and its quantity-`1` Position atomically.

Model destination inputs as tagged unions that accept existing IDs or definitions for new manual records. Run final mutations inside SQL transactions so closing the wizard does not leave half-created Custodians, empty Accounts, or unpriced custom Assets.

Validate on the engine boundary that:

- the destination Custodian is manual;
- the destination Account belongs to that Custodian and has the expected kind;
- Stocks and Crypto reference provider-backed Assets of the correct class;
- quantity, balance, and value are finite;
- Current/Savings currencies are fiat;
- an existing `(account_id, asset_id)` Position is updated rather than duplicated;
- system direct-ownership records cannot be selected, renamed, or deleted through ordinary manual workflows.

Return a result shaped for the success toast and cache invalidation, including created/updated account IDs and whether the Position was created or updated.

### Dashboard query

Add a dedicated dashboard/account-summary endpoint instead of issuing one request per Account. It should return flattened rows with:

- Account and Custodian IDs and names
- Account kind
- Manual/connected source
- Connector identity when applicable
- Base currency
- Position count
- Valued total
- Incomplete/stale indicators
- System presentation role when applicable

Keep the endpoint presentation-oriented and leave full Position detail to existing Account routes. The direct-ownership backing Account may be returned as an **Other assets** presentation row without exposing its system hierarchy.

## Route-Backed Modal Architecture

Use TanStack Router's nested/pathless layout pattern from its official location-modal example. The desired URL is already `/add-assets/...`, so route masking is unnecessary.

Create a pathless Dashboard layout that always renders the Dashboard and a child `<Outlet>`. Modal routes render through that Outlet, keeping the Dashboard mounted behind the modal on navigation, browser Back, direct entry, and refresh.

Suggested route families:

```text
/
/add-assets
/add-assets/$category
/add-assets/$category/connect/$connectorId
/add-assets/$category/manual/asset
/add-assets/$category/manual/custodian
/add-assets/$category/manual/account
/add-assets/$category/manual/quantity
/add-assets/other/manual
```

Use validated category literals and validated search parameters for durable selected IDs. Route guards should redirect an incomplete deep link to the nearest valid prior step. Store only non-sensitive, unfinished form values in a route-scoped draft if needed for refresh continuity; connector credentials remain component-local.

Navigation behavior:

- Browser Back moves one wizard step backward.
- The modal close button, Escape, and overlay dismissal return to `/`.
- Completion replaces the modal history entry with `/`, invalidates Dashboard/Custodian/Account/Asset queries, and shows the success toast.
- Refresh preserves the current modal route and background Dashboard.
- Opening a step directly renders a usable modal or redirects to its prerequisite; it never renders an empty full page.

Reference during implementation:

- TanStack Router route masking guide: <https://tanstack.com/router/latest/docs/guide/route-masking>
- TanStack Router location-modal example: <https://tanstack.com/router/latest/docs/framework/react/examples/location-masking>

## Web UI Structure

Before implementing UI, rerun the required Astryx discovery workflow from `apps/web`:

1. `pnpm exec astryx build "dashboard with route-backed add assets modal wizard"`
2. Inspect every named template with `pnpm exec astryx template <name>`.
3. Inspect exact props for the modal/dialog, list, search, form, progress, and navigation components with `pnpm exec astryx component <Name>`.

Use only verified Astryx components and token-based customization. Follow the repository constraints: AppShell/SideNav for the frame, no raw layout `<div>` elements, no Card-wrapped dense lists, no decorative badges, and no hardcoded styling values.

### Dashboard

- Header: **Dashboard** and primary **Add assets** button.
- Empty state: explain that Optimus can connect a provider or track assets manually, with the same Add assets action.
- Populated state: edge-to-edge Account rows, not one Card per Account.
- Each row uses Account name as the primary label and Custodian/provider as secondary context.
- Show Manual/Connected as quiet status metadata.
- Keep the first Dashboard intentionally narrow: do not redesign allocation charts, individual holding cards, or portfolio analytics in this phase.

### Add assets shell

- Use one accessible modal shell with **Add assets** as the stable heading.
- Give each route a contextual step heading, Back control, and close control.
- The category and connector screens have searchable dense lists or selectable tiles using documented Astryx patterns.
- Manual remains the final option in every connector list.
- Forms use submit-then-change validation, retain friendly field errors, and preserve the existing connector instruction disclosure.
- Loading and mutation states remain inside the modal; prevent duplicate submission.

### Settings and legacy management

Change primary SideNav to:

- **Dashboard**
- **Settings**

Settings contains:

- **Connections**: connected providers, sync state, resync, credential editing, and removal.
- **Institutions & wallets**: management entry points for manual Custodians and their Accounts where needed.
- **Advanced data**: subdued/debug links to the raw Custodian, Account, and Asset catalog views.

Move the current Asset list out of primary navigation. Preserve raw routes initially for diagnostics and backward compatibility, but link to them only through Settings/Advanced data. Redirect obsolete creation entry points to the relevant Add assets route so there is one normal creation workflow.

## Implementation Sequence

### 1. Contracts and migration

- Add `AccountKind` and system presentation-role contracts.
- Add connector `assetClasses` metadata and connector Account kind.
- Implement and register migration `0004_account_kind_and_system_roles`.
- Update fixtures, API schemas, and generated/consuming TypeScript types.

### 2. Engine use cases

- Implement filtered manual Custodian/Account lookup helpers.
- Implement absolute Position upsert.
- Implement transactional manual Stocks/Crypto, Current/Savings, and Other Asset operations.
- Add the flattened Dashboard summary endpoint.
- Keep connector reconciliation behavior intact and prove it imports classes beyond discovery metadata.

### 3. Router frame

- Replace the root redirect with the Dashboard pathless layout and index.
- Add the nested Add assets modal route tree.
- Add validated params/search and prerequisite redirects.
- Implement modal dismissal, Back, success replacement, and refresh behavior.

### 4. Modal flows

- Build searchable category selection.
- Build strict connector selection and credential import.
- Build provider-only Stocks/Crypto asset search.
- Build contextual manual Custodian selection/creation.
- Build strict Account selection/creation and absolute quantity update.
- Build Current/Savings Account creation with currency and Balance.
- Build Other Asset creation without destination selection.

### 5. Dashboard and Settings

- Add the Dashboard empty and populated account states.
- Move Connections and raw domain management under Settings.
- Remove Custodians and Assets from primary navigation.
- Add success toasts and complete cache invalidation.
- Redirect legacy creation links to Add assets.

### 6. Cleanup and verification

- Remove superseded page-only creation components after route tests prove the new workflow.
- Regenerate `routeTree.gen.ts` through the TanStack Router plugin rather than editing it manually.
- Run formatting, linting, typechecks, focused tests, and the full build.
- Exercise the modal in the real app at desktop and narrow viewport sizes.

## Test Plan

### Connector package

- IBKR advertises only `security`; OKX advertises only `crypto`.
- A connector discovered through one class may still return and import other valid classes.
- Connector Account output includes its Account kind.

### Engine and database

- Migration backfills each legacy Account deterministically and preserves all rows/history.
- Current, Savings, Securities, Crypto, and Other Account kinds satisfy database constraints.
- Manual lookups never return synced Custodians or Accounts.
- Duplicate Custodian names work across and within management modes.
- A security/crypto Position can exist in several Accounts but remains unique within one Account.
- Re-adding the same asset/account updates the absolute quantity.
- Cash creation atomically creates Account plus fiat Position, including negative balances if the existing finance rules allow them.
- Custom creation atomically creates Asset, manual price, direct-ownership destination, and Position.
- Failed validation or transaction rollback leaves no partial Custodian, Account, Asset, price, or Position.
- System-managed records cannot leak into manual pickers or ordinary deletion/edit paths.
- Dashboard summaries report totals, incomplete valuations, stale prices, Account kind, and source correctly.
- Synced Custodians remain read-only and connector reconciliation is unchanged.

### Web routing and UX

- `/` renders Dashboard and no longer redirects.
- Add assets uses the same label for its button and modal title.
- Each modal URL survives refresh with the Dashboard behind it.
- Browser Back follows steps; close returns to `/`; success replaces the modal entry.
- Category search and connector search filter accessibly.
- Connector filtering is strict and Manual is always available.
- Connector-less categories skip directly to manual entry.
- Multiple connections to one connector remain possible.
- Stocks/Crypto never expose a custom fallback.
- Manual Custodian lists include all manual Custodians and exclude every synced one.
- Account lists filter strictly by Account kind.
- Creating a securities/crypto Account requires an explicit name and editable base currency.
- Existing Position selection prefills quantity and uses **Update quantity**.
- Current/Savings create a new Account rather than selecting a nested Account.
- Other assets never ask for a Custodian or Account.
- Success invalidates data and shows a contextual toast.
- Settings is the only primary-navigation path to raw Assets and Custodians.

### Visual and accessibility verification

- Modal focus is trapped, initial focus is sensible, Escape/close are operable, and focus returns to Add assets.
- Every step has one programmatic heading and correctly associated form labels/errors.
- Keyboard-only users can search and select categories, connectors, Custodians, Accounts, and assets.
- Long names, empty states, loading states, inline failures, and narrow layouts remain usable.
- No raw layout elements, undocumented Astryx props, imported custom CSS, or hardcoded style values are introduced.

## Explicitly Out of Scope

- Redesigning individual holding/Position presentation
- Allocation charts or portfolio analytics
- FX as a first-step category
- Custom securities or custom crypto
- Connector import preview or selective Account import
- Mixed manual and synced Accounts under one Custodian
- Manual additions into connector-owned Accounts
- Transactions, lots, cost basis, or additive quantity semantics
- Account merging or automatic merging of duplicate Custodian names
- New bank connectors; the design only prepares their `fiat` discovery and Account-kind contracts

## Acceptance Criteria

The phase is complete when a user can start from the Dashboard and, entirely inside a refresh-safe modal, do each of the following:

1. Connect IBKR or OKX and import all returned Accounts/Positions.
2. Search for a supported stock or crypto, choose/create a manual Custodian, explicitly choose/create a compatible Account, and set its absolute quantity.
3. Create a Current or Savings Account under a manual bank with any supported fiat currency and current Balance.
4. Create an Other Asset with a current value without seeing Custodian or Account concepts.
5. Return automatically to a refreshed Dashboard that shows the resulting Account-level outcome.

Custodians and Assets must no longer be primary navigation concepts, while their raw views remain available through Settings for connection management and debugging.
