# Spec: Trade Republic Connector

Status: ready-for-agent

## Problem Statement

Satella cannot automatically retrieve a Trade Republic portfolio. Trade Republic does not expose a documented retail brokerage API for current securities and PEA holdings, while its official Open Banking interface is limited to qualifying third-party payment services. The available automatic path is an undocumented web login and data protocol that requires an AWS WAF-capable browser during authentication and can change without notice.

## Solution

Add Trade Republic as a local synced Custodian using an engine-owned Connector. Authentication opens an isolated pinned Chromium through Playwright, accepts the phone number and PIN, then requests the four-digit confirmation code in the same form flow. Those three values remain in memory only. The resulting session and refresh tokens are encrypted in the Vault and used for subsequent Refreshes without retaining a browser.

Discover account wrappers dynamically instead of restricting the Connector to France. The ordinary securities wrapper becomes a brokerage Account, ordinary cash becomes a checking Account, a recognized French PEA wrapper becomes a brokerage Account named PEA with its cash represented as a Cash Position, and unknown wrappers become generically named brokerage Accounts. Stable Trade Republic account numbers are preferred over country-specific wrapper labels as external identifiers.

Retrieve every discovered Account and Position that can be represented. A successful complete response reconciles the entire Custodian as usual. If one discovered wrapper or topic fails while others are usable, return a partial result: atomically update the usable Accounts while preserving unseen existing Accounts and Positions. Only a result that successfully covers every discovered wrapper may remove an Account or zero an absent Position.

Positions use ISIN as their primary identifier when supplied, retain quantity without requiring a live quote, and accept Trade Republic-reported Average unit purchase price without inventing one. A missing quote leaves valuation unavailable; Average unit purchase price is never substituted as current market price.

Auto-refresh checks Trade Republic no more than once every six hours. Manual Refresh bypasses the automatic cadence. Authentication expiry places the Custodian in Re-authentication required and stops automatic attempts until the person signs in again. No unofficial badge, tooltip, warning, or acknowledgement is included in the current interface.

## User Stories

1. As a Trade Republic customer, I want to add my Custodian with my phone number, PIN, and confirmation code, so that Satella can retrieve my portfolio locally.
2. As a Trade Republic customer, I want to find Trade Republic from every relevant Connector discovery category, so that I do not need to know whether Satella considers it a broker, cash account, or crypto source.
3. As a Trade Republic customer, I want the Connector form to explain the phone, PIN, and confirmation-code sequence, so that I know what will happen before login starts.
4. As a Trade Republic customer, I want my PIN entered through a secret input, so that it is not exposed on screen.
5. As a Trade Republic customer, I want the form to move to a four-digit confirmation-code step after login starts, so that I can complete two-factor authentication without restarting.
6. As a Trade Republic customer, I want to cancel an authentication attempt, so that I can stop an accidental or stale login safely.
7. As a Trade Republic customer, I want an expired authentication attempt rejected clearly, so that an old code is not submitted to an unrelated process.
8. As a Trade Republic customer, I want an incorrect PIN or confirmation code reported without an automatic retry, so that Satella does not increase my lockout risk.
9. As a Trade Republic customer, I want Satella to wait for me to request another confirmation code, so that it never generates repeated SMS or push requests by itself.
10. As a privacy-conscious user, I want my phone number, PIN, and confirmation code to remain on my device and out of persistent storage and logs, so that login secrets are not retained.
11. As a privacy-conscious user, I want each authentication attempt isolated from previous attempts, so that cookies and temporary browser data do not leak between sessions.
12. As a returning user, I want saved session tokens reused and refreshed automatically, so that I do not repeat two-factor authentication unnecessarily.
13. As a returning user, I want rotated session tokens saved without losing my portfolio update, so that subsequent Refreshes continue working.
14. As a user whose session has expired, I want the Custodian to show Re-authentication required and wait for me instead of repeatedly attempting login.
15. As a user re-authenticating, I want the existing Custodian and Accounts retained, so that signing in again does not create duplicates or lose history.
16. As a user closing the Vault during authentication, I want the attempt and browser stopped, so that secrets do not survive the Vault lifecycle.
17. As a user quitting Satella during authentication, I want the attempt and browser stopped, so that no hidden process remains alive.
18. As a French customer, I want my ordinary securities account represented as a brokerage Account, so that my CTO holdings appear in the expected place.
19. As a French customer, I want my ordinary cash represented as a checking Account, so that uninvested cash is not mixed into my CTO Positions.
20. As a French customer, I want my PEA represented as its own brokerage Account, so that tax-wrapped holdings remain distinct from my CTO.
21. As a French customer, I want PEA cash represented as a Cash Position inside the PEA, so that the wrapper's complete value stays together.
22. As a customer in another country, I want ordinary brokerage and cash accounts imported without requiring a French product, so that the Connector remains useful outside France.
23. As a customer in another country, I want Satella to avoid inventing a PEA when Trade Republic does not report one, so that my portfolio matches my actual products.
24. As a user with multiple securities wrappers, I want every discovered wrapper represented as an Account, so that Satella retrieves as much of my portfolio as the protocol exposes.
25. As a user with an unfamiliar wrapper, I want it retained as a generically named brokerage Account, so that a new regional product is not silently ignored.
26. As a user whose Trade Republic labels change, I want stable account numbers used for reconciliation, so that Accounts are renamed rather than duplicated.
27. As a user with an account currency reported by Trade Republic, I want that currency used as the Account base currency, so that values are not hard-coded to France or EUR.
28. As an investor, I want every reported Position retained by stable Trade Republic identity and ISIN when available, so that Satella can reconcile and price it reliably.
29. As an investor, I want exact fractional quantities retained, so that small security or crypto Positions are not rounded away.
30. As an investor, I want listed securities classified as Stocks & ETFs when Trade Republic data supports that classification, so that allocation remains useful.
31. As a crypto investor, I want Trade Republic-identified crypto retained as Crypto, so that it is not presented as an ordinary security.
32. As an investor in a private fund or unfamiliar instrument, I want the Position retained as Other assets, so that unsupported pricing does not erase wealth.
33. As an investor, I want Trade Republic-reported Average unit purchase price imported, so that Unrealized P&L can use an authoritative acquisition fact.
34. As an investor with a manual Average unit purchase price, I want my manual value to remain authoritative after every Refresh, so that Connector data never overwrites my correction.
35. As an investor, I want an omitted Average unit purchase price to preserve the last Connector value, so that a less complete response does not erase an acquisition fact.
36. As an investor, I want a valid Trade Republic quote stored with its actual currency and observation time, so that current valuation has traceable inputs.
37. As an investor, I want a Position retained when no live quote is available, so that a pricing failure does not remove the underlying asset.
38. As an investor, I want Satella to leave valuation unavailable when no quote exists, so that Average unit purchase price is not misrepresented as current market price.
39. As a user completing a full Refresh, I want absent Accounts removed and absent Positions zeroed as with other Connectors, so that a complete Trade Republic snapshot remains authoritative.
40. As a user receiving a partial Trade Republic response, I want usable Accounts updated while unseen existing Accounts and Positions are preserved, so that one broken topic cannot erase my portfolio.
41. As a new user receiving a partial Trade Republic response, I want every discovered Account represented even when one Account's Positions are temporarily unavailable, so that Satella exposes the maximum known structure.
42. As a user, I want an unreadable or empty protocol response treated as a failure rather than a complete empty portfolio, so that protocol breakage cannot destroy data.
43. As a user, I want each reconciliation committed atomically, so that I never observe half-applied Accounts or Positions.
44. As a user leaving Satella running, I want Trade Republic attempted no more than once every six hours, so that Auto-refresh remains conservative.
45. As a user pressing Refresh, I want an immediate attempt even when the next automatic Refresh is not due, so that I can request fresh data deliberately.
46. As a user whose automatic Refresh fails transiently, I want the next automatic attempt delayed by the Trade Republic cadence, so that failures do not trigger requests every fifteen minutes.
47. As a user whose Custodian rate-limits Satella, I want the current attempt stopped without rapid retries, so that Satella does not compound the rate limit.
48. As a user with several Custodians, I want Trade Republic work to use the same serialized queue, so that it never overlaps another manual or automatic Refresh unexpectedly.
49. As a user with the Screen lock active, I want established token-based Auto-refresh to continue, so that privacy mode does not make my portfolio stale.
50. As a user with the Screen lock active during login, I want the bounded authentication attempt to remain private and expire normally, so that revealing the interface is still required to continue.
51. As a user whose Vault is locked, I want no Trade Republic browser or Refresh activity to continue, so that the Custodian follows the Vault boundary.
52. As a user, I want Trade Republic failures translated into actionable authentication, network, timeout, invalid-response, or rate-limit outcomes, so that I know whether to retry or re-authenticate.
53. As a privacy-conscious user, I want Trade Republic error bodies and raw portfolio payloads excluded from UI errors and logs, so that diagnostics do not leak financial data.
54. As a Trade Republic customer, I want the Connector presented like the other supported choices without an unofficial badge, tooltip, warning, or acknowledgement, so that the current interface remains simple.

## Implementation Decisions

- Add a `connector-trade-republic` package following the existing Connector package boundary and compiled registry.
- Advertise Trade Republic through the Stocks & ETFs, Crypto, Cash, and Other assets discovery categories. Bundle its normal Connector icon and concise login instructions using the same metadata mechanism as existing Connectors.
- Extend the Connector account output with an Account type so one Connector can return checking and brokerage Accounts. Existing Connectors declare their current type explicitly instead of relying on Connector-ID inference in the engine.
- Extend Connector Position output with an optional Custodian-reported current price containing an exact decimal price, ISO currency, and observation time. This feeds the existing reported-price reconciliation path and remains distinct from Average unit purchase price.
- Extend Connector output with complete versus partial snapshot semantics. Complete output preserves current destructive reconciliation; partial output atomically upserts returned Accounts and Positions without removing or zeroing unseen data.
- Replace the one-shot-only authentication contract with the interactive engine-owned protocol recorded in ADR 0009. The protocol supports start, challenge submission, completion, cancellation, expiry, and cleanup. Existing API-key Connectors use its immediate-completion path.
- Expose authentication through the Finance API as an opaque attempt identifier plus public challenge state. The renderer never receives a browser handle, process identifier, WAF token, cookie, or durable Trade Republic token.
- Keep phone number, PIN, confirmation code, WAF tokens, process identifiers, browser cookies, and temporary browser profiles out of persisted credential input and diagnostic logs. Persist only the minimum durable session/refresh state needed for unattended Refresh.
- Store only durable Connector session state in the existing encrypted Custodian configuration boundary. Do not route transient authentication input through the current save-before-authentication path.
- Return rotated durable state from authentication and Refresh to an engine service responsible for encrypted persistence. Persist valid token rotation even when later portfolio parsing fails, and do not give Connector packages SQL access.
- Persist Re-authentication required and the last Refresh-attempt time as explicit Custodian sync state. Add a forward-only migration and seal it according to the permanent migration lineage.
- Use pinned packaged Playwright Chromium as recorded in ADR 0010. Do not depend on system Chrome, Electron renderers, or a hosted browser.
- Inject the browser runtime into the Connector environment so protocol logic can be tested without launching Chromium. Keep browser ownership and cleanup in the engine lifecycle rather than the Connector parser or desktop shell.
- Use a fresh isolated headless browser context and temporary profile for each authentication attempt. Acquire the AWS WAF material through that browser, perform the observed phone/PIN and confirmation-code requests, extract only the durable session result, then close the context and delete the profile.
- Use Trade Republic's web origin, actual packaged browser identity, and required web-client metadata. Do not use proxies, IP rotation, hosted CAPTCHA services, or a broad stealth plugin. Any narrowly required WAF compatibility adjustment must be isolated, covered by the live smoke test, and documented beside the browser adapter.
- Keep browser acquisition separate from the authenticated HTTP/WebSocket protocol client. Routine token refresh and portfolio retrieval do not launch Chromium unless a future verified protocol change makes it necessary.
- Run only one Trade Republic authentication or Refresh operation at a time through the existing serialized queue. Do not automatically retry PINs, confirmation codes, SMS requests, or failed WAF challenges.
- Discover all securities wrappers and their account numbers from authenticated account metadata. Treat known wrapper labels only as naming/type hints.
- Decode authenticated account metadata as untrusted input and validate every account number, wrapper, currency, and identifier before use. Prefer stable securities and cash account numbers as external Account identifiers.
- Map the default securities wrapper to a brokerage Account and ordinary cash to a separate checking Account. Map the known French tax wrapper to a PEA brokerage Account. Map every other discovered securities wrapper to a generic brokerage Account using the best Trade Republic label available.
- Use the currency reported for each Account or cash response rather than hard-coding EUR. Emit ordinary cash as a Cash Position in the checking Account. Emit wrapper-bound cash, including PEA cash, inside that wrapper's brokerage Account.
- Subscribe only to the read-only account, cash, portfolio, and ticker topics needed for the snapshot. Treat the observed protocol and client versions as adapter constants with fixture coverage, not as user configuration or a supported Trade Republic contract.
- Emit listed securities with ISIN identifiers, exact quantity, optional authoritative Average unit purchase price, and a reported current price only when the protocol supplies a valid quote. Retain private funds and unknown instruments as Other assets when they cannot be classified more specifically.
- Never use Average unit purchase price or another cost value as reported current price. Missing current price remains missing and is handled by the existing market-data and Portfolio-value completeness behavior.
- Mark output complete only after account discovery and every required response for every discovered Account succeeds and validates. If at least one Account is known but a wrapper or topic fails, emit every safely parsed Account and mark the output partial. If authentication or account discovery itself is unreadable, fail without reconciliation.
- Treat protocol, schema, authentication, WAF, timeout, and rate-limit failures as explicit Connector errors. Never convert an unreadable response into an empty complete snapshot.
- Bound every browser, HTTP, and WebSocket operation with a timeout. Stop streaming subscriptions after every expected response has arrived, and discard late or duplicate messages without logging their payloads.
- Add Connector cadence metadata as recorded in ADR 0011. Trade Republic uses six hours; existing Connectors retain fifteen minutes. Manual Refresh bypasses cadence, and every attempt updates the persisted attempt time so application restarts cannot cause rapid retries.
- Suspend automatic work while Re-authentication required. A successful re-authentication replaces durable session state on the existing Custodian and makes it eligible for future Refresh without replacing Accounts.
- Preserve token-driven Refresh during Screen lock. Close transient browser/authentication resources on completion, cancellation, timeout, Vault close, or engine shutdown.
- Extend the existing Connector form into a stateful authentication flow while preserving the current one-submit behavior for existing Connectors. Use the project's Field, PasswordInput, four-digit PinField, semantic tokens, and standard notification utilities.
- Keep Trade Republic protocol details out of the interface. Show concise actionable states for rejected credentials, rejected/expired confirmation code, Re-authentication required, network failure, timeout, rate limit, and unsupported response.
- Add no user-facing legal or unofficial-use warning in this feature. Keep the internal feasibility research available for later legal/release review.

## Testing Decisions

- Prefer the Finance API as the highest behavioral seam. A fake registered Connector should drive authentication, challenge, durable-session persistence, Refresh, token rotation, reconciliation, scheduling state, and Re-authentication required without tests reaching into SQL or queue internals.
- Add one fixture-driven Connector seam for behavior the Finance API fake cannot prove. Sanitized browser, HTTP, and WebSocket fixtures cover default brokerage, ordinary cash, French PEA, PEA cash, multiple wrappers, unknown wrappers, private funds, crypto, missing quotes, malformed topics, authentication expiry, token rotation, timeouts, and rate limits.
- Test browser orchestration behind the injected runtime seam. Automated tests use a fake browser and assert observable requests, returned session state, cancellation, timeout, and cleanup rather than Playwright method calls or selectors.
- Test the Finance API authentication flow through start, challenge, completion, cancellation, expiry, Vault close, engine shutdown, and Re-authentication required transitions.
- Test that no phone number, PIN, confirmation code, WAF token, cookie, session token, account number, balance, or raw Trade Republic payload reaches logs or API error messages.
- Test complete reconciliation removes missing data, while partial reconciliation updates returned data and preserves unseen Accounts and Positions.
- Test a newly discovered Account in a partial result is created without treating absent Positions as zero, and that a later complete result fills or removes it authoritatively.
- Test mixed checking and brokerage Account types from one Connector and migration away from Connector-ID type inference without changing current IBKR, Kraken, or OKX behavior.
- Test ISIN identity, exact quantities, Asset-category mapping, Custodian-reported Average unit purchase price, manual purchase-price precedence, retained omitted purchase price, reported-price currency/time, and missing-price behavior through public finance reads.
- Test the scheduler with its existing test-clock seam: fifteen-minute checks, Trade Republic six-hour eligibility, manual bypass, persisted failure delay across restart, authentication suspension, and continued market-data work.
- Test browser and durable-session cleanup on Vault close and engine shutdown, plus continued established Refresh during Screen lock.
- Use the existing route-level in-memory engine harness for the Connector form. Cover connector discovery, phone/PIN entry, confirmation-code transition, submission, cancellation, expired attempt, errors, Re-authentication required, existing one-step Connectors, narrow layout, and keyboard/accessibility behavior.
- Extend packaged-runtime tests only for resolving and launching the pinned browser artifact from the engine. Do not test Electron internals through Connector tests.
- Follow existing prior art: Connector contract suites for normalized output, Finance service/API Effect tests for reconciliation, the Auto-refresh test clock for cadence, route tests for forms, and desktop helper tests for packaged-resource resolution.
- Run a human-owned live account smoke test locally before considering the Connector operational. It must prove packaged Chromium launch, WAF acquisition, two-step login, default/PEA discovery where available, cleanup, token refresh, manual Refresh, and one automatic eligibility cycle.
- Credentials, session material, account numbers, raw responses, screenshots containing financial data, and resulting unsanitized fixtures must never be committed, copied into issue comments, or sent to an agent.

## Out of Scope

- Trading, order placement, deposits, withdrawals, or any other write operation.
- Transaction history, tax documents, statements, dividends, fees, realized P&L, or a complete activity ledger.
- Official PSD2/TPP onboarding or hosted credential processing.
- User-configurable Refresh intervals.
- A CSV/PDF import workflow.
- A user-facing unofficial-connector warning or legal acknowledgement.
- Automatic CAPTCHA solving, proxy rotation, IP rotation, aggressive retries, or generic stealth plugins.
- Guaranteeing every country-specific product before a sanitized fixture or live account proves its response shape.
- Replacing Chromium with an experimental browser runtime in the shipping path.
- Keeping a persistent browser profile or browser process alive between ordinary Refreshes.
- Hosted browser execution, remote credential handling, telemetry containing Custodian data, or server-side portfolio aggregation.
- Multiple simultaneous Trade Republic authentication attempts or parallel account-topic subscriptions that increase request volume.

## Further Notes

- Feasibility, official export alternatives, contractual risk, and browser-runtime research are recorded in `docs/research/trade-republic-connector-feasibility.md`.
- This design intentionally makes regional parsing extensible but verifies France first. An ordinary non-French account can still produce only the Accounts Trade Republic exposes, such as a single brokerage Account.
- ADR 0011 supersedes only the fixed-cadence part of ADR 0006. ADR 0007's serialized queue remains unchanged.
- The conversation already settled the testing boundaries: engine-owned runtime, Finance-level orchestration, Connector fixtures for protocol mapping, and a local human smoke test. No additional design interview is required before implementation.
