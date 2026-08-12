# Interactive Brokers Flex Connector Plan

## Goal

Add a built-in Interactive Brokers connector that imports each reported IBKR account, its end-of-day open positions, and its configured cash balances without requiring Optimus to be registered with IBKR and without requiring users to install or keep TWS, IB Gateway, or Client Portal Gateway running.

The first implementation should use the Flex Web Service Version 3. It is a read-only reporting integration, not a trading or real-time portfolio integration.

## Research Conclusion

Flex Web Service is the right first integration for this application's distribution and operating model.

| Option | App registration | User-installed/running software | Authentication burden | Data freshness | Decision |
| --- | --- | --- | --- | --- | --- |
| Flex Web Service v3 | None for Optimus | None | User creates a Flex token and query ID in Client Portal | Activity data updates once daily at close of business | Use for v1 |
| Client Portal Web API via Client Portal Gateway | None for an individual user | Java and the local gateway; browser login must happen on the same machine | Interactive login and 2FA at least daily | Intraday | Reject for v1 |
| Direct Web API OAuth | IBKR onboarding and Compliance approval for a third-party product | None | OAuth application lifecycle | Intraday | Reject while Optimus is an unregistered open-source app |
| TWS API | No OAuth app registration | TWS or IB Gateway must be installed, running, and logged in | GUI login; ongoing session/restart management | Real-time | Reject for v1 |

Why Flex fits:

- IBKR explicitly describes it as a standalone HTTPS API for generating and retrieving preconfigured reports.
- After setup, requests use a token and query ID rather than the user's IBKR username, password, or 2FA session.
- Tokens may be issued for between six hours and one year and may optionally be restricted to an IP address.
- A master-account token can retrieve linked-account data when those accounts are included in the query, so the connector can support multi-account reports.
- Optimus only needs complete portfolio snapshots; it does not need orders, market data, or an intraday brokerage session.

The material limitation is freshness. Activity Flex data changes once daily at close of business, and IBKR recommends retrieving the prior day's report the following day. A user who trades during the day will not see that trade reflected until the next reporting cycle. Keep this limitation in the connector instructions Markdown; it is not a special UI feature.

## Initial Scope

The connector returns one Optimus account per `FlexStatement` and imports:

- account identity, display name, and base currency from `FlexStatement` and `AccountInformation`;
- security and crypto quantities from `OpenPositions`;
- trade-date cash balances from the per-currency rows in `CashReport`, or the base-currency summary when breakout is not selected;

The initial connector deliberately excludes:

- orders, executions, transactions, dividends, cost basis, tax lots, P&L, and performance history;
- IBKR-provided prices and position values;
- trading of any kind;
- Client Portal Gateway, OAuth, TWS, and IB Gateway fallback modes;
- automatic creation or modification of a Flex Query in Client Portal;
- scheduled background syncs beyond the application's existing manual resync flow.

The connector may import all documented non-cash IBKR asset categories as positions, but only simple spot-like holdings are eligible for automatic symbol pricing in the first version. See “Asset mapping and valuation safety.”

## Required User Setup

Bundle `packages/connectors/src/ibkr/instructions.md` with exact Client Portal steps. The user must:

1. Open Client Portal and go to Reporting > Flex Queries.
2. Create an **Activity Flex Query**, not a Trade Confirmation query.
3. Configure output as XML and period as **Last Business Day**.
4. Include the desired account or accounts. For linked accounts, create the query from the same account selection under which it will later be managed.
5. Include these sections and fields:
   - Account Information: Account ID, Account Alias, Currency, Name.
   - Open Positions: Account ID, Currency, Asset Class, Symbol, Description, Conid, Security ID, Security ID Type, CUSIP, ISIN, FIGI, Quantity, Multiplier, and Level of Detail.
   - Cash Report: Account ID, Currency, Ending Cash.
6. Configure Open Positions at **Summary** level. Select the Cash Report's **Base Currency Summary** option for a base-currency cash position, or **Currency Breakout** when per-currency balances are needed.
7. Enable Flex Web Service, generate a token, and choose an expiration. IP restriction is optional and should only be used when the user knows the machine's stable public egress IP.
8. Copy the Flex token and Activity Query ID into Optimus.

The instructions should explain that:

- the token is a secret and should be treated like an API key;
- creating a new token invalidates the previous one;
- Flex Query definitions are username-specific;
- Activity data is end-of-day data and normally needs only one sync per day;
- no Trade or account-management permission is requested by Optimus.

## Connector Credentials and Capability

Define an Effect Schema for:

```ts
interface IbkrFlexCredentials {
  readonly token: string;
  readonly queryId: string;
}
```

Expose two credential fields:

- `token`: label “Flex token,” password field;
- `queryId`: label “Activity Query ID,” text field.

Use connector ID `ibkr` and name `Interactive Brokers`. Bundle the SVG logo supplied by the user at `https://companieslogo.com/img/orig/IBKR-96866d95.svg?t=1720244492&download=true` and expose it through the existing connector capability icon field.

The current engine persists connector credentials in plaintext JSON. This is an existing project limitation, but the Flex instructions and code must treat the token as secret. Never put it in an error, trace, test snapshot, or log message.

## Package Shape

```text
packages/connectors/
  src/
    ibkr/
      client.ts
      connector.ts
      index.ts
      instructions.md
      parser.ts
      schemas.ts
    index.ts
    registry.ts
  test/
    ibkr.test.ts
    fixtures/
      ibkr-flex-multi-account.xml
      ibkr-flex-empty-account.xml
```

Use synthetic or thoroughly redacted fixtures only. No real account ID, token, query ID, name, address, email, or portfolio should enter the repository.

Update the connector package's asset-copy build step so bundled Markdown files are copied for every connector rather than hard-coding only `src/okx`.

## Flex Client

Implement the two-step Flex Web Service v3 flow directly with Effect's HTTP client.

Use the fixed origin and endpoints documented by IBKR:

```text
https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest
https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement
```

Every request includes `v=3`, a non-empty `User-Agent`, and an XML-compatible `Accept` header.

### 1. Generate the report during authentication

`authenticate` calls `SendRequest` with:

- `t`: Flex token;
- `q`: Activity Query ID;
- `v`: `3`.

Parse the XML response. A success must contain `Status=Success` and a non-empty numeric `ReferenceCode`. Ignore the legacy response URL returned in the XML and retain only the reference code. Return an authenticated handle that closes over the token, fixed client, and reference code.

This makes the existing connector lifecycle useful rather than wasteful: authentication starts exactly one report generation, and `fetchAccounts` retrieves that same generated report. It must not call `SendRequest` a second time.

### 2. Retrieve and poll during account fetch

`fetchAccounts` calls `GetStatement` with:

- `t`: the same token;
- `q`: the reference code, not the original Query ID;
- `v`: `3`.

IBKR generates reports asynchronously. Poll only `GetStatement` when IBKR returns a documented not-ready/transient code such as 1003, 1004, 1005–1009, 1019, or 1021. Use a bounded schedule with at least one second between requests, a short exponential delay capped around ten seconds, and a total deadline around one minute. Do not busy-poll and do not restart generation while polling.

Apply a per-request timeout. Treat an ambiguous network failure from `SendRequest` as a failed sync rather than automatically resubmitting and possibly generating duplicate reports. A later user-initiated resync can safely start over.

IBKR documents a `SendRequest` limit of one request per second and ten requests per minute per token. Return a rate-limit error for code 1018 or HTTP 429; do not retry through it.

### Transport safety

- Build query parameters with `URLSearchParams`; never concatenate raw credentials into a path string.
- Keep parameters separate in the injectable test transport so request assertions never require printing a complete secret-bearing URL.
- Never follow the legacy URL from an IBKR response.
- If the HTTP layer follows redirects, only permit HTTPS redirects within the documented IBKR host allowlist so a token cannot be forwarded to an arbitrary host.
- Do not include raw response bodies in errors.
- Bound response size before or while buffering it.
- Use safe, provider-neutral timeout/network messages.

## XML Parsing and Validation

Flex success, Flex failure, and report payloads are all XML, and almost all report data is carried in element attributes. Add `saxes` as a direct runtime dependency and implement a small streaming parser for only the elements this connector needs. This avoids building a permissive general XML object graph and makes response-size enforcement straightforward.

The parser should:

- reject DTD and custom entity declarations;
- enforce a conservative maximum response size;
- accept normal XML escaping and empty attributes;
- collect only `FlexStatement`, `AccountInformation`, `OpenPosition`, and `CashReportCurrency` attributes;
- separately recognize `FlexStatementResponse` error/success envelopes;
- validate the collected unknown data with Effect Schema before mapping it;
- tolerate unknown elements and attributes so IBKR can add unrelated report fields without breaking the connector;
- reject an unexpected root, non-Activity report type, malformed XML, missing required sections, missing required attributes, CSV/text output, or an empty statement collection.

Required query-shape validation is important because users customize Flex reports themselves. A valid token and Query ID are not sufficient if the query omits `conid`, `position`, base currency, or usable cash data. Return a concise setup-oriented error that points the user back to the bundled instructions; never reconcile a partial report.

## Account Mapping

For every `FlexStatement`:

- external account ID: trimmed `FlexStatement.accountId`;
- name: `AccountInformation.acctAlias` plus the account ID when present, otherwise the account ID;
- base currency: uppercase `AccountInformation.currency`;
- positions: merged security/crypto rows plus per-currency cash rows, or one base-currency cash row from `BASE_SUMMARY`.

Assert that nested `AccountInformation`, `OpenPosition`, and `CashReportCurrency` account IDs are either absent or equal to the containing statement's account ID. Reject duplicate `FlexStatement` account IDs.

Return accounts even when all quantities are zero so existing synchronized account identities do not disappear.

## Position Mapping

### Cash

Map `CashReportCurrency.endingCash` to a fiat position:

```text
external asset ID: ibkr:currency:<ISO>
asset class: fiat
name and symbol: <ISO>
identifier: iso_currency=<ISO>
quantity: endingCash
```

Rules:

- Use `endingCash`, the trade-date balance, rather than `endingSettledCash`.
- Preserve finite negative cash balances.
- Drop exact zero quantities after validation.
- Ignore the synthetic `currency="BASE_SUMMARY"` row when per-currency rows are present; when it is the only cash row, use its `endingCash` as the account's base-currency cash balance.
- Prefer actual three-letter per-currency rows, including the base currency row, when `Currency Breakout` is selected. If a report contains only `BASE_SUMMARY`, map its `endingCash` to the account's base currency; this preserves the configured base-currency cash total without inventing a currency breakdown.
- Do not add segment fields such as `endingCashSec` and `endingCashCom`; `endingCash` is already their account total.
- Ignore `OpenPosition` rows whose asset category is `CASH`; the Cash Report is the authoritative source for currency holdings and avoids double counting forex cash.

### Securities and crypto

Use `conid` as the required stable IBKR identity:

```text
external asset ID: ibkr:conid:<CONID>
primary identifier: ibkr_conid=<CONID>
quantity: OpenPosition.position
```

Add non-empty standard identifiers when present:

- `isin` from ISIN;
- `cusip` from CUSIP;
- `figi` from FIGI;
- a normalized identifier derived from `securityIDType` only when both the type and value are present and it does not duplicate one of the explicit fields.

Use `description`, then `symbol`, then `IBKR <conid>` as the display name.

Map `CRYPTO` to connector asset class `crypto`. Map the documented non-cash contract categories (`BILL`, `BOND`, `CFD`, `CMDTY`, `EVENT_FORECASTX`, `FOP`, `FSFOP`, `FSOPT`, `FUND`, `FUT`, `FXCFD`, `FXFWD`, `IBGNOTE`, `IOPT`, `OPT`, `STK`, and `WAR`) to `security`. Reject an unknown non-cash category rather than silently dropping it from a complete snapshot.

Aggregate repeated rows by account and conid. Summary rows should normally be unique, but aggregation makes model partitions and lot-level reports survivable. Reject a mixture of Summary and Lot rows for the same account/conid or conflicting asset definitions so a misconfigured query cannot double a position.

### Asset mapping and valuation safety

The Optimus connector contract stores a quantity but not an IBKR multiplier or price convention. Therefore:

- preserve `symbol` for `STK`, `FUND`, and `CRYPTO`, where a unit quantity can participate in the existing conservative market-data matching;
- omit the connector asset's optional `symbol` for options, futures, bonds, bills, warrants, CFDs, forwards, structured products, event contracts, and physical commodities;
- retain the human-readable symbol inside the asset name when useful, but do not let those categories be auto-resolved to a generic quote;
- allow those positions to import with missing prices, causing the existing portfolio total to remain explicitly incomplete.

This is safer than multiplying a per-unit quote by a contract count and silently ignoring an option/future multiplier or a bond's percentage-of-par convention. A future domain change can add contract-aware valuation without changing the stable IBKR conid mapping.

## Error Mapping

Map documented Flex errors into the existing connector categories with safe messages:

- 1012 expired token and 1015 invalid token: `invalid_credentials` during authentication or `authentication_expired` during retrieval;
- 1014 invalid Query ID: `invalid_credentials` with a setup-specific message;
- 1011 inactive service, 1013 IP restriction, and 1016 invalid account: `insufficient_permission` during authentication;
- 1018 or HTTP 429: `rate_limit`;
- 1017 invalid reference code: `invalid_response` unless it occurs after a long poll, where the message should say the generated report could not be retrieved;
- documented in-progress/not-ready codes: retry only during retrieval, then `timeout` when the polling deadline is exhausted;
- network and request timeouts: `network` or `timeout`;
- malformed XML, wrong report type/format, missing configured fields, non-finite numbers, conflicting rows, and unknown asset categories: `invalid_response`.

Provider messages may contain more detail than should reach callers. Prefer connector-owned messages and include only a documented numeric Flex error code when it helps support; never include the token, Query ID, reference code, account ID, response body, or full request URL.

## Registry, Engine, and UI Integration

- Export the IBKR connector from `packages/connectors/src/ibkr/index.ts` and the package root.
- Register `IbkrConnector` alongside `OkxConnector` in `BuiltinConnectorRegistry`.
- Keep all XML, HTTP, and IBKR mapping logic in `packages/connectors`; it must not access SQL.
- Do not add connector-specific account fields or connector-specific database/UI state; account freshness belongs in these instructions only.
- The existing dynamic credential form should render the new connector without a connector-specific screen.
- Use the bundled instructions to make the non-real-time behavior and required Flex fields visible before connection.
- Keep complete reconciliation semantics: no database mutation occurs unless report generation, retrieval, parsing, validation, and mapping all succeed.

## Implementation Steps

### 1. Add the IBKR schemas and XML parser

- Define the credential, Flex envelope, statement, account information, position, and cash-row schemas.
- Add `saxes` as a direct dependency.
- Implement bounded streaming extraction and reject unsafe XML constructs.
- Add synthetic fixtures for one account, multiple accounts, an empty account, and the provider's error envelope.

### 2. Implement the Flex HTTP client

- Add the fixed origin and v3 endpoint paths.
- Implement injectable transport, request timeout, response-size bounds, and safe redirects.
- Implement `SendRequest`, response-code decoding, and `GetStatement` polling.
- Keep token-bearing query parameters out of errors and logs.

### 3. Implement mapping and connector lifecycle

- Decode the token and query ID.
- Generate exactly one report from `authenticate` and retain its reference code.
- Retrieve and validate that report from `fetchAccounts`.
- Map account identity, positions, and cash.
- Validate output with the shared `validateConnectorOutput` boundary.

### 4. Register and document the connector

- Add connector exports and registry entry.
- Add user-facing setup instructions and credential help text.
- Generalize the connector package's Markdown asset copy step.
- Use the existing connector discovery and setup UI; keep connector-specific behavior in this Markdown.

### 5. Verify end to end

- Run connector unit tests, engine connector-service tests, database migration/startup tests, and web route tests.
- Run package typechecks and the workspace test suite.
- Manually verify the setup form renders token as a password and Query ID as text.
- When a real IBKR smoke test is possible, use a locally supplied token/query ID only; do not add it to shell history, fixtures, logs, screenshots, or committed files.

## Test Matrix

### Client and protocol

- Correct fixed endpoint, v3 parameters, User-Agent, and URL encoding.
- Successful `SendRequest` returns a reference code.
- `fetchAccounts` uses that reference code and never starts a second report.
- `GetStatement` polls 1019/not-ready responses and stops after success.
- Polling honors minimum spacing and a bounded deadline.
- 1018/429 is not retried.
- HTTP errors, timeouts, redirects, and oversized bodies never expose secrets.

### Parsing and configuration

- XML entities such as `&amp;` decode correctly.
- DTD/custom entities, malformed XML, HTML, CSV, and unexpected roots fail.
- Unknown unrelated fields are ignored.
- Missing Account Information, base currency, conid, position, or usable Cash Report fields fails before reconciliation.
- A Trade Confirmation report is rejected.
- `BASE_SUMMARY` becomes a base-currency cash position when no per-currency rows are present and is never emitted as a synthetic currency asset.

### Mapping

- One and multiple Flex statements become stable accounts.
- Account name fallback order is deterministic.
- Account aliases never fall back to the account holder's personal name; the account ID is always available in the imported label.
- Positive, negative, and zero cash behave correctly.
- Short positions remain negative.
- Duplicate conid rows aggregate only when their definitions and detail mode are compatible.
- `CASH` open-position rows do not duplicate Cash Report holdings.
- STK/CRYPTO retain symbols; ETF/FUND matching starts with ISIN before any ticker/name search, while contract-multiplier categories do not become auto-priceable.
- ISIN, CUSIP, FIGI, and conid identifiers deduplicate without emitting blank values.
- An unknown asset category fails the complete import.
- An empty but valid account remains present with zero positions.

### Integration and regression

- Registry capabilities contain both OKX and IBKR.
- Credentials round-trip through the existing connection and resync service.
- A failed IBKR fetch leaves prior accounts and positions untouched.
- A later complete report removes closed positions through existing reconciliation semantics.
- Existing OKX, manual account, asset matching, and snapshot tests remain green.

## Acceptance Criteria

- A user can connect IBKR using only a Flex token and Activity Query ID.
- Optimus does not require app registration, OAuth credentials, TWS, IB Gateway, Client Portal Gateway, Java, or a continuously authenticated IBKR session.
- One sync imports all statements included by the query, their open positions, and the configured cash balances (per-currency when Currency Breakout is enabled, otherwise base currency).
- The connector Markdown explains that Flex data is daily/end-of-day; the account UI has no connector-specific freshness banner.
- Misconfigured or partial reports fail without destructive reconciliation.
- Tokens and account-identifying provider data never appear in logs or committed fixtures.
- Derivative and fixed-income positions are not silently assigned incorrect valuations.

## Deferred Follow-ups

- Automatic once-daily scheduling after IBKR's reporting close.
- A downloadable sample Flex Query configuration if IBKR exposes a stable/importable template format.
- Contract-aware multiplier, bond, option, future, CFD, and structured-product valuation.
- Intraday Web API support if Optimus later completes IBKR third-party onboarding or intentionally introduces a local-gateway mode.
- Encrypted connector secret storage for all providers.
- Transactions, income, cost basis, tax lots, and performance history from additional Flex sections.

## Research Sources

Primary IBKR documentation used for the decision and protocol:

- [Flex Web Service](https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/): two-step v3 protocol, fixed endpoints, required User-Agent, token/query setup, pacing, polling, error codes, and daily Activity data behavior.
- [Enable Flex Web Service](https://www.ibkrguides.com/adminportal/performanceandstatements/flex-web-service.htm): eligible account types, token generation, expiration, and optional IP restriction.
- [Create an Activity Flex Query](https://www.ibkrguides.com/adminportal/performanceandstatements/activityflex.htm): customizable sections/fields, XML output, periods, accounts, and models.
- [Account Information fields](https://ibkrguides.com/reportingreference/reportguide/account%20information%20activity%20flex.htm), [Open Positions fields](https://www.ibkrguides.com/reportingreference/reportguide/open%20positionsfq.htm), and [Cash Report fields](https://ibkrguides.com/reportingreference/reportguide/cash%20reportfq.htm): the report data required by the mapping.
- [IBKR reporting asset types](https://www.interactivebrokers.com/campus/ibkr-reporting/reporting-integration/): documented asset-category codes.
- [Client Portal Web API v1](https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/): individual-client gateway installation, same-machine browser authentication, daily reauthentication, and session constraints.
- [Web API access methods](https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/): third-party onboarding and Compliance approval requirements.
- [TWS API initial setup](https://interactivebrokers.github.io/tws-api/initial_setup.html): requirement for a running, interactively authenticated TWS or IB Gateway instance. This page is deprecated but its installation/session constraint is also reflected in current IBKR API guidance.

A mature open-source parser, [ibflex](https://github.com/csingley/ibflex), was reviewed only to corroborate real-world XML element/attribute shapes and the need for tolerant parsing. The protocol and product decision rely on IBKR's own documentation.
