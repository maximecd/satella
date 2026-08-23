# Trade Republic connector feasibility and legal risk

Research date: 2026-08-23
Status: investigation only; no implementation change

## Bottom line

A Trade Republic connector is technically feasible for a best-effort, read-only
portfolio snapshot, but the currently observable route is an undocumented client
protocol rather than a supported public API. The reference implementation can
authenticate and read cash, positions, and quotes, yet it depends on browser/WAF
behaviour, guessed client metadata, a hard-coded WebSocket protocol, JWT layout,
and undocumented response shapes. Those dependencies make breakage likely and
make support, monitoring, and incident recovery part of the product rather than
ordinary connector maintenance (reference implementation: `services/tr-auth/main.py:45-108`,
`backend/src/main/java/.../TradeRepublicAdapter.java:35-58,197-226`).

The contractual risk is more serious than the engineering risk. Trade Republic's
current Online Brokerage Framework Agreement says that services may be used only
through the Application on an authorised device or other access channels Trade
Republic provides in its regular business operations, and expressly prohibits
access paths, programs, or interfaces not provided by Trade Republic outside the
Application. It reserves extraordinary termination for a violation
([French Customer Agreement, sections III.1.2-III.1.3](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)).

Trade Republic does advertise an official PSD2/Open Banking interface, but it is
not a general public brokerage API: the official support material describes
regulated Third Party Providers (TPPs), OAuth 2.0, a qualified website
authentication certificate (QWAC), onboarding/documentation by request, and
current-account AIS/PIS use cases ([Open Banking for third parties](https://traderepublic.com/en-de/support?articleId=488f48ff-8cbc-4832-b1b4-21bcd72cc7b1),
[Open Banking API access for TPPs](https://traderepublic.com/de-at/support?articleId=0c5b7d7c-5970-4c6e-88ef-7be7e96c8fbd)).

Recommendation: do not ship the unofficial browser/WAF/WebSocket route as a
normal connector until Trade Republic gives written permission or counsel has
confirmed the intended use, terms, and French/EU legal position. First ask Trade
Republic's Open Banking team whether the project can qualify for their official
interface; otherwise keep the first release to a user-mediated export/import
workflow. This is a risk recommendation, not a legal opinion.

### Product direction after research

The product owner accepts the documented risk for development and has chosen to
proceed with an automatic, local Connector. The implementation will use an
engine-owned pinned Playwright Chromium, attempt generic account discovery with
France-specific PEA recognition, and expose no unofficial-connector warning in
the current interface. Legal and release review remain separate future work.

## Evidence and confidence

Facts below are either taken from an official Trade Republic/EU/French source or
from the supplied local reference implementation inspected read-only. Statements
labelled **Inference** are conclusions from those facts. **Unknown** means that
the public sources reviewed do not answer the question and counsel or Trade
Republic must answer it.

The local source citations intentionally use only generic relative file names and
line ranges. They identify the observed mechanism without identifying the source
project.

## Official Trade Republic facts

### Login, 2FA, and lockout

- Trade Republic's web login uses the account phone number and PIN, then a
  four-digit confirmation code delivered by push notification; the support page
  says an SMS code can be requested after 30 seconds ([web login security](https://support.traderepublic.com/en-ie/685),
  [how to log in](https://support.traderepublic.com/pl-pl/1359-How-can-I-log-in-into-my-Trade-Republic-account)).
- Trade Republic says it may restrict access after too many attempts, including
  attempts from different IP addresses in a short period; too many incorrect PIN
  entries or SMS-code requests require customer support ([unlock account](https://support.traderepublic.com/en-de/1540-How-can-I-unlock-my-account)).
- Trade Republic's security guidance says it will never ask a customer for their
  PIN or SMS verification code and tells customers not to share or store those
  credentials ([account safety](https://support.traderepublic.com/en-de/1686-How-can-I-keep-my-account-safe)).

**Inference:** a connector that collects the PIN and one-time code centrally,
replays them through a non-official client, or retries aggressively creates a
material account-lockout and phishing-like risk even when the account holder
initiated the flow. A strict one-at-a-time flow, bounded retries, no credential
logging, and a user-visible stop condition would be minimum controls. The
inference follows from the official lockout and credential-handling guidance,
not from an observed Trade Republic assertion that this connector is malicious.

### Contract and supported access paths

The Customer Agreement says:

- the Application on a Trade Republic-authorised device is a prerequisite for
  custody-account management and trading, subject to other access channels
  Trade Republic provides in its regular business operations; and
- use of features/services through access paths, programs, or interfaces not
  provided by Trade Republic outside the Application is prohibited, with a
  reserved right of extraordinary termination for violation
  ([French Customer Agreement, sections III.1.2-III.1.3](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)).

This is a direct contractual fact. It does not by itself answer whether French
criminal law would apply to a particular read-only request made by the account
holder, but it means customer consent alone should not be treated as permission
from the system operator.

### Official Open Banking route

Trade Republic's support material describes two Open Banking use cases:

1. an AIS/Account Information Service Provider reading information from an
   activated current account; and
2. a PIS/Payment Initiation Service Provider initiating payments from that
   current account.

The customer is redirected to Trade Republic login and must confirm the access or
payment request ([Open Banking FAQ](https://traderepublic.com/en-de/support?articleId=488f48ff-8cbc-4832-b1b4-21bcd72cc7b1)).
The provider-facing material says the dedicated PSD2 APIs use OAuth 2.0 and
require a valid QWAC, and that the developer documentation, sandbox, API
reference, and go-live requirements are supplied after Trade Republic reviews a
TPP request ([TPP API access](https://traderepublic.com/de-at/support?articleId=0c5b7d7c-5970-4c6e-88ef-7be7e96c8fbd)).

Trade Republic's FAQ says AIS access can last up to 180 days, after which the
customer must grant it again; it lists account data, cash balance, and cash
movements (including fees, interest, and taxes) for the current-account use case,
not a securities-position feed ([Open Banking FAQ, data points and duration](https://traderepublic.com/de-de/support?articleId=488f48ff-8cbc-4832-b1b4-21bcd72cc7b1)).

**Inference:** "no API" is too broad. There is an official, restricted Open
Banking API path for qualifying TPPs, but the public material does not promise
that it exposes custody holdings, PEA positions, or brokerage quotes. It is not
an obvious drop-in replacement for a personal desktop connector.

## Official export and import fallback

The safer first integration is user-mediated import. The user downloads files
from the Trade Republic application and gives Satella only those files. This
avoids collecting a PIN or one-time code and does not require browser
automation. It is still an import feature, not a scheduled sync.

The following export/document capabilities are confirmed by official Trade
Republic sources as of the research date:

- The current French Customer Agreement says that all bank bookings appear on
  the account statement and that the customer can access an account statement
  for a desired period through self-service in the Application. It also says
  that the customer can create a custody-account statement for a chosen period
  through self-service ([French Customer Agreement, Appendix 1 section 4.1 and
  Appendix 5 section XIV](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)).
- The France Help Center says the profile timeline includes executed securities
  transactions. Opening one shows more detail and documents that can be viewed
  or downloaded separately ([where to find the securities account
  statement](https://support.traderepublic.com/fr-fr/845)).
- The France-locale tax-report article says the annual tax report is a PDF under
  Profile > Tax. It describes realized capital gains and other investment
  income, exemption-order usage, withheld taxes, loss certificates, and foreign
  withholding taxes ([tax report](https://support.traderepublic.com/fr-fr/1078-Was-ist-die-Jahressteuerbescheinigung)).
- Trade Republic's April 2026 France press release says customers can export a
  new detailed tax report as a spreadsheet and that the feature would roll out
  progressively in France and other core markets ([France press release,
  15 April 2026](https://assets.traderepublic.com/assets/files/Press_Release_fr_fr_CS.pdf)).
  A parallel official release calls that spreadsheet format CSV and mentions
  direct sharing with tracking tools, but this does not publish the CSV schema
  or establish that every French account has the same file ([official English
  release](https://assets.traderepublic.com/assets/files/Press_Release_de_en_CS.pdf),
  [official Spain release specifying CSV](https://assets.traderepublic.com/assets/files/Press_Release_es_es_CS.pdf)).
- A Trade Republic Help Center article at the France locale currently displayed
  in German says that a cash-account statement contains cash transactions for
  selected months and can be downloaded as a PDF. It also describes a free
  quarterly custody statement and an annual tax certificate in the Application
  ([statement and annual tax certificate](https://support.traderepublic.com/fr-fr/267)).
  The language and country differences mean this should be verified against a
  French account before making it a product promise.

The public material does **not** document the fields or a stable import
contract for the spreadsheet/CSV. In particular, it does not confirm that the
export contains current holdings, quantities, ISINs, PEA versus ordinary
securities-account identifiers, cash balances, average purchase prices, or a
cost-basis field. The press release mentions more detailed returns and purchase
prices in the new analysis tools, but does not say that those values are in the
export. It also does not publish delimiters, encoding, headers, transaction
type values, pagination, file versioning, or a stable transaction identifier.

The documents are still enough to make a useful manual fallback, with explicit
limits:

| Satella input                                    | Official evidence                                              | Import confidence                                                |
| ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Cash activity and period balances                | Account statements contain bank bookings and periodic balances | Good after testing a real French PDF/CSV                         |
| Executed security transactions                   | Timeline exposes executed transactions and per-event documents | Plausible, but the exported fields and coverage are undocumented |
| Current positions and quantities                 | A custody-account statement can be generated                   | Unknown until a real statement is inspected                      |
| ISIN, PEA/CTO wrapper, average price, cost basis | No official export field list                                  | Unknown; do not infer these from a tax report                    |
| Annual tax data                                  | Annual PDF tax report and new spreadsheet tax report           | Useful for tax context, not a current portfolio snapshot         |

For a first implementation, accept only files the user downloaded from Trade
Republic, keep the original file and a hash for auditability, detect the file
type from its headers or PDF text, and reject files whose required fields are
missing. A repeatable refresh can work by asking the user for a fresh complete
export and deduplicating only on fields that the file actually provides. The
official sources do not establish an incremental cursor or a stable transaction
ID, so an unattended scheduled refresh must remain out of scope until a sample
export proves those properties.

## What the reference implementation demonstrates

The following is a technical feasibility study only. It is not treated as an
official specification, and its endpoint names and payloads should not be
copied without a separate legal/security decision.

### Authentication flow

1. A headless Chromium context loads `https://app.traderepublic.com`, attempts
   to obtain an AWS WAF token through `AWSWafIntegration.getToken()`, and falls
   back to an `aws-waf-token` cookie. It sets a desktop Chrome user agent and
   changes `navigator.webdriver` to return `undefined`
   (reference implementation: `services/tr-auth/main.py:45-88`).
2. The sidecar sends `POST https://api.traderepublic.com/api/v1/auth/web/login`
   with JSON `phoneNumber` and `pin`, plus browser-like `Origin`, `Referer`,
   `x-tr-app-version`, `x-tr-device-info`, `x-tr-platform`, and optional
   `x-aws-waf-token` headers. It expects a `processId`
   (reference implementation: `services/tr-auth/main.py:91-108,146-171`).
3. After the user enters the four-digit code, the sidecar sends
   `POST /api/v1/auth/web/login/{processId}/{tan}` with another fresh WAF token.
   It extracts `tr_session` and optionally `tr_refresh` from response cookies
   (reference implementation: `services/tr-auth/main.py:174-227`).
4. Later refreshes send `POST /api/v1/auth/web/refresh` with `tr_refresh` as a
   cookie and expect new `tr_session`/`tr_refresh` cookies
   (reference implementation: `services/tr-auth/main.py:230-265`).

The sidecar retains a process-id-to-WAF-token map only in memory and removes the
entry on completion, but completion deliberately obtains a fresh WAF token
(reference implementation: `services/tr-auth/main.py:34-35,174-180`). The
backend's login bridge passes phone/PIN and process-id/TAN to the sidecar and
stores the returned tokens; its comments say phone/PIN are not persisted
(reference implementation: `backend/src/main/java/.../TradeRepublicSyncService.java:91-125`).

### Data protocol and data available

The backend opens `wss://api.traderepublic.com/`, sends a `connect` message with
protocol version `31` and web-client metadata, and uses `sub` messages for:

- `availableCash` for cash;
- `compactPortfolioByType` scoped by securities-account number for positions;
- `ticker` scoped by an instrument identifier for current prices.

The observed position fields are ISIN/instrument id, `netSize`, and
`averageBuyIn`; the observed ticker field is `last.price`. The adapter computes
portfolio value as quantity × live price, falling back to average buy-in when a
price is missing (reference implementation: `backend/src/main/java/.../TradeRepublicAdapter.java:35-49,234-360,440-480`).

The adapter decodes the middle segment of the session JWT to find
`act.acc.owner` securities and cash account numbers. It maps the default wrapper
to a securities account and `tax_wrapper_fr` to a French PEA account, then scopes
cash reads for PEA accounts (reference implementation: `backend/src/main/java/.../TradeRepublicAdapter.java:598-668`).
It skips positions marked `privateFund` because no ticker response is expected;
for other positions it guesses `.LSX` for most instruments and `.TRD0` for a
Trade Republic-native crypto ISIN prefix (reference implementation:
`backend/src/main/java/.../TradeRepublicAdapter.java:336-360`).

The implementation therefore demonstrates a useful read-only snapshot, not a
complete transaction ledger. The reviewed path does not establish a supported
way to retrieve all trades, statements, tax documents, corporate actions, or
historical prices. **Unknown:** whether any of those are available through the
current undocumented protocol for all jurisdictions and account types.

## Local browser/runtime options

The runtime constraints are unusually important here: credentials, WAF
challenges, cookies, and provider responses must stay on the user's device;
the first packaged target is macOS arm64; execution should remain owned by the
engine; and the browser must run the real Trade Republic JavaScript/AWS WAF
flow long enough to return cookies or tokens. A small HTML/JS engine is not
automatically a viable substitute for a browser that happens to render ordinary
web pages.

### The Cloudflare/Rust browser lead

The product likely heard about is Cloudflare **Kitesurf**. Cloudflare describes
it as a stateless browser running entirely on Workers and exposed through the
remote Browser Run service. It uses Rust components such as Blitz and Stylo,
but it is not a local Rust binary that Satella can package. More decisively,
Cloudflare says Kitesurf is not yet suitable for negotiating a bot-challenge
handshake with real TLS fingerprints or for a long authenticated session that
needs persistent state ([Kitesurf announcement](https://blog.cloudflare.com/kitesurf/),
[Kitesurf Browser Run changelog](https://developers.cloudflare.com/changelog/post/2026-08-06-kitesurf/)).
The regular Browser Run Chromium service is remote for the same reason. Both
fail the local-only credential/network boundary, and Kitesurf also fails the
WAF/session requirements. It should not be a connector dependency.

### Comparison

| Option                                                        | What it actually is                                                                                                                                                                                                                                                                                                               | Packaging/runtime cost                                                                                                                                                                                                                                                                                                                             | JS, WAF, and session outlook                                                                                                                                                                                                                        | Assessment                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Playwright or Puppeteer with a pinned bundled Chrome/Chromium | Node client plus a real Chromium browser                                                                                                                                                                                                                                                                                          | Largest option: Playwright documents browser caches in the few-hundred-MB range; Puppeteer documents about 170 MB for Chrome for Testing on macOS (plus its headless-shell download) ([Playwright browser management](https://playwright.dev/docs/browsers), [Puppeteer installation](https://pptr.dev/guides/installation))                       | Best compatibility and best odds for the existing JS/WAF flow; headless operation, isolated contexts, cookies, and CDP are mature. Still not a guarantee that Trade Republic accepts automation.                                                    | **Recommended baseline spike.** Straightforward engine-owned Node implementation and reproducible packaging. |
| `playwright-core` or `puppeteer-core` with system Chrome      | Client only; launches a user-installed Chrome/Chromium executable                                                                                                                                                                                                                                                                 | Small Satella payload, but requires Chrome on every machine and inherits its update policy. Both projects warn that custom executables are not guaranteed to work like their bundled browser ([Playwright `executablePath`](https://playwright.dev/docs/api/class-browsertype), [Puppeteer launch](https://pptr.dev/api/puppeteer.launchoptions)). | Full browser compatibility and a normal local Chrome network identity are attractive, but version drift makes WAF and CDP behavior less reproducible.                                                                                               | Viable fallback/developer mode, not a reliable packaged default.                                             |
| Reuse Electron's Chromium                                     | A Chromium renderer already shipped by the desktop shell, not a separate engine browser                                                                                                                                                                                                                                           | Avoids a second browser payload, but requires a new engine↔Electron protocol, hidden `BrowserWindow`/renderer lifecycle, and a separate profile. Electron's Chromium version follows the Electron release ([Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)).                                               | Real Blink/V8 gives good JS coverage, but Electron branding/version and hidden-window behavior are additional variables for WAF. It is not naturally engine-owned.                                                                                  | Possible later optimization; not the first implementation.                                                   |
| Obscura                                                       | A local Rust/V8 browser engine with its own CDP server; no Chrome or Node required                                                                                                                                                                                                                                                | The project claims a roughly 70 MB binary and 30 MB baseline memory, and publishes macOS arm64 binaries; embedding the Rust crate compiles V8 from source ([Obscura README](https://github.com/h4ckf0r0day/obscura), [Rust library](https://github.com/h4ckf0r0day/obscura/blob/main/docs/Use-as-a-Rust-library.md)).                              | Promising JS/CDP surface and optional native TLS/identity handling, but it is a different browser/network stack with no evidence yet that Trade Republic's WAF/login succeeds. "Stealth" features would also increase circumvention and legal risk. | **Recommended secondary spike only.** Run the same fixture against it; keep a Chromium fallback.             |
| Lightpanda                                                    | A local headless browser built from scratch in Zig, not Chromium or WebKit, controlled over CDP                                                                                                                                                                                                                                   | Small standalone macOS arm64 binary; the project reports substantially lower memory and faster startup than Chrome ([Lightpanda README](https://github.com/lightpanda-io/browser), [quickstart](https://lightpanda.io/docs/quickstart)).                                                                                                           | It executes JavaScript and supports Web APIs, but it intentionally omits a graphical browser and has a smaller compatibility surface. No evidence reviewed shows it can obtain the required AWS WAF token or preserve the full authenticated flow.  | Useful HTML/SPA experiment, but not a first-choice Trade Republic runtime.                                   |
| `chromiumoxide`, `headless_chrome`, or `fantoccini`           | Rust control libraries: the first two speak CDP to an external Chrome; Fantoccini speaks WebDriver to an external driver/browser ([chromiumoxide](https://github.com/mattsse/chromiumoxide), [headless_chrome](https://github.com/rust-headless-chrome/rust-headless-chrome), [Fantoccini](https://github.com/jonhoo/fantoccini)) | Rust removes Node from a helper, not the browser. `headless_chrome` can fetch Chrome, while Fantoccini adds a WebDriver service; binary and browser maintenance remain.                                                                                                                                                                            | Compatibility comes from the underlying Chrome/WebKit browser. `headless_chrome` documents a smaller/incomplete CDP surface, including no WebSocket inspection, and Fantoccini offers less Chromium-specific control.                               | Not a cheaper browser. Consider only if the connector later moves into a Rust service.                       |
| Wry/native `WKWebView`/WebView2                               | A Rust wrapper over the OS WebView: WebKit on macOS, WebKitGTK on Linux, WebView2 on Windows ([Wry platform notes](https://github.com/tauri-apps/wry), [Apple `WKWebView`](https://developer.apple.com/documentation/webkit/wkwebview))                                                                                           | Very small app payload on macOS, but a UI/event-loop-oriented WebView; Linux adds GTK/WebKitGTK runtime dependencies and Windows relies on WebView2.                                                                                                                                                                                               | The macOS engine is WebKit rather than Chromium, with no standard CDP surface equivalent to the observed flow. JS may run, but browser/WAF and hidden-background behavior are not predictable enough.                                               | **Not viable for the first connector.**                                                                      |

The WAF column is an engineering inference, not a promise from any project.
The first test should use the same account flow and a disposable Trade Republic
account, record only success/failure and non-sensitive diagnostics, and avoid
automation-hiding patches in the baseline. A local browser keeps traffic on the
user's IP; it does not remove the provider-terms risk described above.

### Recommended spike order

1. Use the engine's existing Node runtime with a pinned, packaged Chromium and
   Playwright (or Puppeteer) as the compatibility baseline. Use a fresh
   temporary profile per authentication attempt, keep PIN/TAN only in memory,
   extract cookies/tokens in memory, and close/delete the profile immediately.
2. In parallel or immediately after, test the same login fixture through the
   local Obscura CDP binary. Treat its small footprint as an optimization only
   if it passes the real WAF/login and cookie lifecycle tests; do not enable its
   stealth mode by default without a separate legal/security decision.

System Chrome can be offered as an explicit developer fallback. Electron reuse
and Lightpanda are later experiments, not reasons to change the engine boundary
now. Cloudflare Kitesurf/Browser Run and every hosted Lightpanda/Obscura option
are out of scope because account credentials and session material would leave
the device.

### Regional scope and account discovery

The observed protocol has a useful generic shape: a default securities account
and cash account can be discovered from the authenticated account metadata, with
the reviewed implementation treating `tax_wrapper_fr` as an optional France
PEA wrapper. That is evidence from one client implementation, not an official
provider contract. Trade Republic's own material confirms that France has a
local branch, French IBAN/current-account services, and a PEA offering, while
the French agreement limits a customer to one PEA ([France imprint](https://traderepublic.com/fr-fr/imprint),
[French customer agreement](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)).

Recommendation: use best-effort generic discovery rather than making the whole
connector France-only. Map the ordinary/default wrapper to a generic brokerage
account and its cash account in every market; map a recognized France PEA
wrapper to a PEA account; preserve unknown wrapper/account labels as generic
accounts with the raw provider type retained. Keep France-specific PEA and
cash/IBAN assertions behind fixtures, and do not assume the same wrapper
identifiers or number of cash accounts in other countries.

### Session lifecycle

The backend encrypts session and refresh tokens before persistence and assigns an
observed two-hour expiry hint. On an `AUTHENTICATION_ERROR`, it calls refresh;
only a refresh response of 401/403 is treated as a rejected session, while 429,
5xx, timeout, or an empty response is treated as transient
(reference implementation: `backend/src/main/java/.../TradeRepublicSyncService.java:116-120,153-200`,
`backend/src/main/java/.../TradeRepublicAdapter.java:152-195`).

**Unknown:** Trade Republic does not publicly document the unofficial cookie
lifetimes, refresh-token rotation/reuse rules, concurrent-login behaviour, device
binding, revocation guarantees, or whether the two-hour observation remains
true. Those values must not become hard-coded security promises.

### Fragility and operational failure modes

The reference implementation itself identifies or exhibits these breakpoints:

- protocol version and web-client version are hard-coded;
- authentication depends on AWS WAF token issuance and browser fingerprint
  behaviour;
- the WebSocket JSON has both a newer categorised shape and a legacy shape;
- exchange suffixes are inferred rather than returned consistently;
- ticker subscriptions stream continuously, so completion must count distinct
  subscription responses rather than messages;
- missing quotes and private funds use a cost-basis fallback;
- the flow ends through 30-second receive and 45-second outer timeouts; and
- an authentication error can invalidate a whole snapshot and trigger refresh.

These facts are visible in `backend/src/main/java/.../TradeRepublicAdapter.java:197-226,300-426`.
They imply a non-trivial fixture and canary test suite, protocol-change alerting,
safe fallback semantics, and a manual export fallback before any release.

## Security and abuse analysis

### Credential and token boundary

The unofficial flow requires a service to receive a phone number, PIN, and
one-time code. The reference sidecar logs a masked phone number but also includes
upstream error-body fragments in HTTP exceptions; the Java bridge logs sidecar
error bodies and raw WebSocket payload prefixes. These are potential leakage
surfaces for financial data or provider diagnostics and must be treated as
secrets even when the current logs do not intentionally print the PIN
(reference implementation: `services/tr-auth/main.py:146-163,181-192`,
`backend/src/main/java/.../TradeRepublicAdapter.java:101-105,131-135,245-246,304-306`).

The sidecar's internal HTTP API has no authentication or authorization in the
reviewed file, and its default container command listens on `0.0.0.0:8001`
(reference implementation: `services/tr-auth/main.py:29,146-270`,
`services/tr-auth/Dockerfile:24-29`). **Inference:** it is safe only when kept
inside a strongly isolated network with authenticated access, strict ingress
rules, and no public port exposure. If exposed, an attacker could submit
credentials or obtain session tokens.

The browser runs Chromium with `--no-sandbox`, modifies the webdriver signal,
and presents a fixed browser identity to obtain a WAF token
(reference implementation: `services/tr-auth/main.py:45-57`). **Inference:**
this is a deliberate attempt to make automation look like the supported web
client and could be interpreted as circumvention of an access-control or
anti-automation measure. That materially raises the legal and provider-relations
risk compared with consuming a documented API.

### Lockout, account takeover, and blast radius

Trade Republic's official support warns about account lockout after repeated
attempts, differing source IPs, incorrect PINs, and excessive SMS requests
([unlock account](https://support.traderepublic.com/en-de/1540-How-can-I-unlock-my-account)).
The connector must therefore never auto-retry a PIN/TAN, run parallel login
attempts, rotate IPs, or silently request new codes. A leaked session or refresh
token may allow access without the user's next 2FA step; exact token scope and
revocation are **Unknown**, so the design should assume compromise is account
compromise and provide immediate disconnect/revocation instructions.

## Legal and compliance analysis

This section identifies issues for counsel; it does not conclude that a specific
implementation is lawful or unlawful.

### Contract and customer terms

The French customer agreement's section III.1.3 is unusually direct:
non-provided paths, programs, or interfaces outside the Application are
prohibited and may support
extraordinary termination ([French Customer Agreement, sections III.1.2-III.1.3](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)).
The unofficial flow is, by definition, outside the public Open Banking path and
uses endpoints and protocol messages not supplied as customer-facing interfaces
(reference implementation: `services/tr-auth/main.py:154-185`,
`backend/src/main/java/.../TradeRepublicAdapter.java:551-595`).

**Inference:** even if a customer authorises access to their own account, that
authorisation is not clearly permission to bypass the provider's chosen access
channel. A written provider agreement or explicit permission is the cleanest way
to remove this contractual uncertainty.

### Unauthorized access and circumvention

French Penal Code article 323-1 punishes fraudulent access to or remaining in
all or part of an automated data-processing system, with higher penalties when
data are altered or operation is impaired ([Code pénal, article 323-1](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000047052655/2026-05-11)).
Article 323-3 separately covers fraudulent introduction, extraction, possession,
reproduction, transmission, deletion, or modification of data
([Code pénal, article 323-3](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000030939448/2024-05-18)).
At EU level, Directive 2013/40/EU defines "without right" by reference to lack
of authorisation from the system owner/right holder or national law and requires
criminalisation of intentional access without right that infringes a security
measure ([Directive 2013/40/EU, Articles 2-5](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32013L0040)).

**Unknown:** whether a French court would treat a customer-authorised,
read-only request to the customer's own data as "fraudulent" or "without right"
when the provider's contract prohibits the route. The answer can turn on the
account terms in force, the user's authority, the endpoint's security measures,
the WAF-token and webdriver manipulation, intent, volume, and any harm or
interference. Do not rely on ownership of the data as a complete defence.

### Interoperability and reverse engineering

Directive 2009/24/EC allows a lawful user to observe/study/test a program while
performing entitled acts, and permits limited decompilation when indispensable to
obtain information for interoperability of an independently created program. The
exception is confined to necessary parts and forbids other goals or unreasonable
prejudice to the right-holder; the Directive also preserves contract law outside
its specified exceptions ([Directive 2009/24/EC, recitals 13-18 and Articles 5-8](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32009L0024)).

**Inference:** mapping an undocumented message format for a read-only independent
client may resemble interoperability, but collecting credentials, replaying a
login through a non-provided endpoint, obtaining WAF tokens, and hiding browser
automation are not obviously acts covered by Articles 5-6. Counsel should assess
the exact activity and whether the customer agreement changes the result.

### GDPR and French data protection

The connector handles a phone number, authentication credentials, session
credentials, account identifiers, cash, securities positions, and transactions;
when linked to a person these are personal data. Trade Republic's own privacy
notice says it processes account information, assets, incoming/outgoing payments,
transactions, and security/anti-fraud data to provide services and meet legal
obligations ([Trade Republic App Privacy Notice](https://assets.traderepublic.com/assets/files/app_privacy_policy_en.pdf)).

For an app provider or hosted service, the likely questions are:

- identify whether the provider is a controller, processor, or separate
  controller for credentials and portfolio data;
- document an Article 6 lawful basis, purpose limitation, minimisation, retention,
  user rights, and transparent notice;
- apply privacy by design/default and appropriate security, including encryption,
  access control, logging minimisation, incident response, and deletion;
- evaluate an Article 35 DPIA if the regular monitoring, financial profile, or
  scale makes processing high risk; and
- use Article 28 processor terms where another service processes data on behalf
  of the controller.

These duties follow from GDPR Articles 5-6, 25, 28, 32, and 35
([GDPR consolidated text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)).
CNIL guidance also stresses that scraping is not automatically prohibited by the
GDPR, but requires a lawful basis, minimisation, safeguards, and respect for
websites that oppose automated collection; it warns that other laws and terms
may still prohibit the practice ([CNIL scraping safeguards](https://www.cnil.fr/fr/focus-interet-legitime-collecte-par-moissonnage)).

**Unknown:** whether a purely local, personal/household use falls within GDPR's
household exemption, and what obligations apply to a distributable desktop
application that never receives telemetry. That depends on product, hosting,
support, and business facts; obtain a data-protection review before release.

### PSD2 and Open Banking

PSD2 defines account information service as consolidated information about one or
more **payment accounts**, and Article 67 limits an AISP to designated payment
accounts and associated payment transactions, with explicit consent, secure
communication, and no use outside the requested service ([PSD2 definitions and Article 67](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32015L2366)).
Article 33 treats an entity providing only the Annex I(8) service as a payment
institution subject to the PSD2 framework, and Article 37 prohibits persons who
are neither payment service providers nor expressly excluded from providing
payment services ([PSD2 Articles 33 and 37](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32015L2366)).

**Inference:** a product that only reads the user's own local brokerage data is
not automatically an AISP, but a hosted or commercial account-aggregation
service may be providing account-information services if it accesses a current
account for users. The official Trade Republic material describes the supported
scope as current-account AIS/PIS; it does not establish a PSD2 right to scrape or
read custody/PEA holdings. Do not market the unofficial connector as "PSD2
compliant" without regulatory analysis and, if applicable, registration,
insurance, QWAC, and the provider's onboarding.

## Decision gates before implementation

1. **Provider gate:** ask Trade Republic's Open Banking team for the current
   TPP eligibility, API scope, sandbox, production onboarding, and whether a
   read-only personal-finance use case can be authorised. Keep the request and
   answer in project records ([TPP API access](https://traderepublic.com/de-at/support?articleId=0c5b7d7c-5970-4c6e-88ef-7be7e96c8fbd)).
2. **Counsel gate:** obtain written advice on section III.1.3, French Penal Code
   Articles 323-1/323-3, WAF/anti-automation circumvention, the interoperability
   exception, and whether the product is an AISP or otherwise regulated.
3. **Data-protection gate:** decide local-only versus hosted architecture,
   controller/processor roles, lawful basis, retention, user notice, DPIA need,
   incident handling, and deletion/export semantics before collecting a PIN or
   token.
4. **Security gate:** prefer official OAuth redirect; never ask the app server to
   receive a PIN if an official route avoids it. If an unofficial route is
   authorised, isolate the browser sidecar, authenticate its internal API, keep
   tokens encrypted, prohibit raw payload/error logging, rate-limit and serialize
   auth, and provide disconnect/revocation guidance.
5. **Reliability gate:** define a supported data contract, fixture tests for every
   account wrapper/product type, protocol/version monitoring, stale-data markers,
   snapshot atomicity, and a manual CSV/export fallback. Treat undocumented
   protocol changes as an expected stop-and-review event.

## Open questions

- Does Trade Republic grant written permission for this non-TPP, read-only
  desktop use case, or only the regulated PSD2 path?
- Does the official API expose securities/PEA positions, or only current-account
  cash and transactions?
- What are current session/refresh-token TTL, rotation, device binding, revocation,
  rate limits, and concurrent-login rules?
- Which current customer-agreement version and country-specific terms govern the
  target users?
- What is the exact product role under GDPR and PSD2 if the app is distributed,
  hosted, or synchronises on a schedule?
- Can the user export official statements/CSV locally with sufficient holdings,
  cost basis, and transaction coverage to avoid unofficial access?

## Sources

- [Trade Republic French Customer Agreement, version 07.08](https://assets.traderepublic.com/assets/files/CA_FR-en-fr.pdf)
- [Trade Republic web-login security](https://support.traderepublic.com/en-ie/685)
- [Trade Republic account lockout/unlock guidance](https://support.traderepublic.com/en-de/1540-How-can-I-unlock-my-account)
- [Trade Republic account safety guidance](https://support.traderepublic.com/en-de/1686-How-can-I-keep-my-account-safe)
- [Trade Republic Open Banking FAQ](https://traderepublic.com/en-de/support?articleId=488f48ff-8cbc-4832-b1b4-21bcd72cc7b1)
- [Trade Republic Open Banking API access for TPPs](https://traderepublic.com/de-at/support?articleId=0c5b7d7c-5970-4c6e-88ef-7be7e96c8fbd)
- [Trade Republic App Privacy Notice](https://assets.traderepublic.com/assets/files/app_privacy_policy_en.pdf)
- [French Code pénal, article 323-1](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000047052655/2026-05-11)
- [French Code pénal, article 323-3](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000030939448/2024-05-18)
- [Directive 2013/40/EU on attacks against information systems](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32013L0040)
- [Directive 2009/24/EC on the legal protection of computer programs](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32009L0024)
- [Directive (EU) 2015/2366 (PSD2)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32015L2366)
- [Regulation (EU) 2016/679 (GDPR)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [CNIL guidance on legitimate interest and scraping](https://www.cnil.fr/fr/focus-interet-legitime-collecte-par-moissonnage)
- [Cloudflare Kitesurf announcement](https://blog.cloudflare.com/kitesurf/)
- [Cloudflare Kitesurf Browser Run changelog](https://developers.cloudflare.com/changelog/post/2026-08-06-kitesurf/)
- [Obscura browser](https://github.com/h4ckf0r0day/obscura)
- [Lightpanda browser](https://github.com/lightpanda-io/browser)
- [Playwright browser management](https://playwright.dev/docs/browsers)
- [Puppeteer installation](https://pptr.dev/guides/installation)
- [Puppeteer launch options](https://pptr.dev/api/puppeteer.launchoptions)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [chromiumoxide](https://github.com/mattsse/chromiumoxide)
- [rust-headless-chrome](https://github.com/rust-headless-chrome/rust-headless-chrome)
- [Fantoccini](https://github.com/jonhoo/fantoccini)
- [Wry](https://github.com/tauri-apps/wry)
- [Apple `WKWebView`](https://developer.apple.com/documentation/webkit/wkwebview)
