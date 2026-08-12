# Connector Service Layer and First OKX Connector Plan

## Goal

Define the smallest useful connector boundary and prove it with the first real connector, OKX.

A connector has two responsibilities:

1. authenticate with the external institution;
2. fetch the user's accounts and their current positions.

Connectors do not price assets. Cash is not a special balance type; it is a normal position whose asset is fiat. The engine remains responsible for asset reconciliation, pricing, persistence, snapshots, scheduling, and HTTP/UI behavior.

## Connector Contract

Create `packages/connectors` and define the shared contract there. Use an Effect-powered typed definition rather than a base class.

The authentication result should expose `fetchAccounts` so unauthenticated code cannot call it accidentally:

```ts
interface Connector<Credentials> {
  readonly id: string;
  readonly name: string;
  readonly credentialsSchema: Schema.Schema<Credentials, unknown>;

  readonly authenticate: (
    credentials: Credentials,
  ) => Effect.Effect<AuthenticatedConnector, ConnectorAuthenticationError>;
}

interface AuthenticatedConnector {
  readonly fetchAccounts: () => Effect.Effect<
    ReadonlyArray<ConnectorAccount>,
    ConnectorFetchAccountsError
  >;
}
```

`authenticate` validates the credentials against the remote service and returns an opaque authenticated handle. The engine neither reads nor depends on connector-specific session state.

### Account output

```ts
interface ConnectorAccount {
  readonly externalId: string;
  readonly name: string;
  readonly baseCurrencyIso: string;
  readonly positions: ReadonlyArray<ConnectorPosition>;
}

interface ConnectorPosition {
  readonly asset: ConnectorAsset;
  readonly quantity: number;
}

interface ConnectorAsset {
  readonly externalId: string;
  readonly assetClass: "fiat" | "security" | "crypto";
  readonly name: string;
  readonly symbol?: string;
  readonly identifiers: ReadonlyArray<ConnectorAssetIdentifier>;
}

interface ConnectorAssetIdentifier {
  readonly type: string;
  readonly value: string;
}
```

Requirements:

- Account and asset external IDs must be stable across fetches.
- A position is identified by its account and asset; it does not need its own external ID.
- Quantities may be positive, zero, or negative, but must be finite.
- Cash balances use a fiat asset and their currency amount as the quantity.
- Positions do not carry prices, values, cost basis, or P&L in this version.
- `fetchAccounts` returns one complete snapshot. If any required upstream request fails or cannot be decoded, the whole operation fails instead of returning a destructive partial result.
- Provider SDK and response types must not escape the connector implementation.

### Expected errors

Keep errors small and actionable:

- authentication: invalid credentials, insufficient permission, unsupported region, network failure, rate limiting, or invalid response;
- account fetching: authentication expired, network failure, rate limiting, or invalid response.

Errors must have a stable category and a safe message. They must never include credentials, request signatures, authenticated headers, or raw response bodies.

## Package Shape

```text
packages/connectors/
  src/
    connector.ts
    registry.ts
    okx/
      connector.ts
      client.ts
      schemas.ts
      index.ts
  test/
    okx/
      authentication.test.ts
      fetch-accounts.test.ts
```

The explicit built-in registry initially contains only OKX. The registry exposes connector definitions by stable ID; it does not own credentials or authenticated sessions.

## OKX Connector

### Scope

The first OKX connector returns three stable accounts:

```text
OKX
  Trading
    positions by currency
  Funding
    positions by currency
  Earn
    positions by currency
```

Use these stable external IDs:

- `trading` for the trading account;
- `funding` for the funding account;
- `earn` for the Simple Earn Flexible account.

All three accounts use `USD` as their initial base currency, matching the engine's current reporting default. Return the accounts even when they contain no positions so their identities do not appear and disappear between synchronizations.

Initial OKX scope includes spot currency balances held in the trading, funding, and Simple Earn Flexible accounts. It deliberately excludes:

- futures, perpetual swaps, options, and margin-contract positions;
- other financial-product positions such as fixed-term and on-chain Earn products;
- trading bots;
- sub-accounts;
- transactions and orders;
- WebSocket synchronization;
- prices reported by OKX.

Those concepts need separate domain decisions and must not be flattened into misleading spot quantities.

### Credentials and regions

Define an OKX credential schema containing:

- API key;
- secret key;
- passphrase;
- region: `global`, `eea`, or `us`;
- environment: `live` or `demo`.

Only a read-enabled API key is required. The connector never needs Trade or Withdraw permission.

Select the REST origin from a fixed region allowlist rather than accepting an arbitrary URL:

- global: `https://openapi.okx.com`;
- EEA: `https://eea.okx.com`;
- US/Australia: `https://us.okx.com`.

Demo requests use the same regional REST origin and add `x-simulated-trading: 1`.

The connector contract does not decide how credentials are stored. For the initial implementation, the engine stores them in `custodian_connectors.config_json` and supplies them to `authenticate` for later resyncs. This is deliberately temporary plaintext storage; encryption and a dedicated secret-storage boundary are deferred. Tests use injected credentials and a mocked HTTP client.

### Authentication

Implement the small REST client directly with Effect's HTTP client and Node cryptography; the small set of read-only endpoints does not justify exposing a broad exchange SDK.

For every private request:

1. create an ISO-8601 UTC timestamp with millisecond precision;
2. concatenate `timestamp + uppercase method + request path including query + body`;
3. sign it with HMAC-SHA256 using the secret key;
4. Base64-encode the signature;
5. send `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, and `OK-ACCESS-PASSPHRASE`.

Use `GET /api/v5/public/time` to calculate a server clock offset for request signing. `authenticate` then calls the read-only `GET /api/v5/account/config` endpoint. A decoded success proves the key, secret, passphrase, region, timestamp, and Read permission are usable before an authenticated handle is returned.

Apply a bounded timeout to every request. Retry only transient GET failures and rate limits, with a small configured attempt limit and server-provided delay when available. Never retry invalid credentials or invalid responses.

### Fetching accounts

After authentication, `fetchAccounts` performs three required reads:

- `GET /api/v5/account/balance` for the trading account;
- `GET /api/v5/asset/balances` for the funding account;
- `GET /api/v5/finance/savings/balance` for the Simple Earn Flexible account.

The calls may run concurrently. All three must succeed and decode before returning anything.

Map them as follows:

- Trading position quantity: the currency's `cashBal`, which represents the held currency balance rather than only its currently available portion.
- Funding position quantity: the currency's `bal`, which includes available and frozen funds.
- Earn position quantity: the currency's `amt` in Simple Earn Flexible.
- Ignore exact zero quantities; never interpret an absent currency as an upstream error because OKX returns only non-zero balances.
- Preserve negative finite trading balances if OKX reports liabilities through the selected balance field.
- Reject blank currency codes and non-finite quantities as invalid responses.
- Aggregate duplicate currency entries defensively before returning an account.

For every currency, return an embedded asset with:

- external ID `okx:currency:<CCY>`;
- symbol and initial display name equal to the uppercase OKX currency code;
- `fiat` plus an `iso_currency` identifier when the code belongs to an explicit, tested set of fiat currencies supported by OKX;
- otherwise `crypto` plus an `okx_currency` identifier. Stablecoins remain crypto assets.

Do not infer fiat from the length or shape of a symbol.

The connector does not own market-data identifiers. During reconciliation, the engine reuses an existing automatic asset only when its symbol match is unambiguous, and preserves the provider identifier already attached to that asset. During an explicit price refresh, an unlinked asset may be resolved through the provider search index only when the result has one unambiguous exact symbol or name match; ambiguous results remain `missing-lookup` rather than being guessed. This keeps OKX prices out of the connector contract.

## Engine Integration

Keep the connector output nested as accounts containing positions. Add a small engine-owned adapter that turns it into the existing reconciliation input:

1. walk every account and position;
2. deduplicate embedded assets by connector external ID;
3. reject conflicting definitions for the same external asset ID;
4. replace each embedded asset in a position with its external asset reference;
5. call `reconcileConnector` with `complete: true`.

Do not move SQL into `packages/connectors`. The connector never reads or writes the engine database.

Replace the hard-coded empty connector capability list with capabilities derived from the built-in registry. Register OKX and persist its credentials in the connector configuration so an existing custodian can be resynced.

## Implementation Steps

### 1. Create the connector package

- Add `packages/connectors` to the workspace with Effect, Effect Schema, and the Effect HTTP client dependencies it actually uses.
- Define the connector, authenticated connector, account, position, asset, identifier, and expected-error types.
- Add schema-backed validation at both credential and provider-response boundaries.
- Add the explicit built-in registry.

### 2. Build the OKX REST client

- Implement fixed region/environment origin selection.
- Implement timestamp synchronization and signed private GET requests.
- Decode OKX's `{ code, msg, data }` envelope before decoding endpoint data.
- Map HTTP and OKX error codes into the connector error categories.
- Redact all credential-bearing values from errors and logs.

### 3. Implement OKX authentication

- Decode credentials.
- Synchronize the signing clock.
- Verify access through `GET /api/v5/account/config`.
- Return an authenticated handle containing only the private client behavior required by `fetchAccounts`.

### 4. Implement OKX account fetching

- Fetch and decode trading, funding, and Simple Earn Flexible balances.
- Map them into the three stable account trees.
- Normalize currency codes and quantities.
- Return no OKX prices and no derivative positions.
- Fail the complete fetch if any required account endpoint fails.

### 5. Bridge the connector into the engine

- Flatten and deduplicate embedded connector assets at the engine boundary.
- Reuse the existing atomic reconciliation behavior.
- Derive connector capabilities from the registry.
- Keep credential resolution injectable and out of connector configuration JSON.

## Connector setup UI

Expose a generic setup flow at `/custodians/new`:

- the index page offers Manual setup or Connect a service;
- `/custodians/new/manual` retains the existing manual form;
- `/custodians/new/connector` selects from registered capabilities and renders fields from the selected connector's public `credentialFields` metadata.

Add a `POST /api/custodians/connect` operation that validates the selected connector, stores its credentials, authenticates, imports the first complete account snapshot, and only then leaves a synced custodian in the database. If authentication or fetching fails, remove the provisional custodian. Add `POST /api/custodians/:id/sync` and a Resync action on the custodian page; it reads the stored credentials and atomically reconciles a new complete snapshot. Never return credentials in API responses or errors.

### 6. Verify behavior

Add deterministic tests using a mocked Effect HTTP client and fixed clock:

1. the signature pre-hash and Base64 HMAC match a known fixture;
2. live and demo requests select the correct headers and allowed regional origin;
3. valid read-only credentials authenticate successfully;
4. invalid key, secret, passphrase, region mismatch, permission failure, clock skew, rate limit, and malformed envelopes map to safe typed errors;
5. trading `cashBal` and funding `bal` become quantities under the correct accounts;
6. available/frozen fields are not mistaken for additional positions;
7. zero entries are omitted and negative finite quantities are retained;
8. one failed balance endpoint fails the complete fetch;
9. secrets never appear in errors or captured logs;
10. nested OKX output is deduplicated and reconciled atomically into a temporary engine database;
11. a second complete fetch updates quantities and removes or zeroes missing state according to the existing reconciliation rules.

Do not make real OKX network calls in the normal test suite. Provide an opt-in local smoke test driven by environment variables only after the credential boundary exists.

## Completion Criteria

This work is complete when:

- the common connector definition contains only metadata, authentication, and authenticated account fetching;
- `fetchAccounts` returns accounts containing positions containing asset definitions and quantities;
- cash needs no connector-specific representation;
- connector output contains no prices;
- the OKX connector authenticates with a read-only API key and returns Trading, Funding, and Earn account trees;
- an incomplete OKX read cannot trigger destructive reconciliation;
- OKX response types and credentials do not leak outside the connector;
- the engine can reconcile the nested output without giving the connector database access;
- connector assets reuse existing automatic assets by unambiguous symbol and price refresh can discover exact provider lookups for previously unlinked assets;
- connector credentials are temporarily persisted in plaintext connector configuration so manual resync works; harden this storage later.

## Official OKX References

- [OKX API guide and authentication](https://www.okx.com/docs-v5/)
- [OKX regional-domain FAQ](https://www.okx.com/en-eu/help/api-faq)
