# Trade Republic uses engine-owned Playwright with pinned Chromium

Status: accepted

The Trade Republic Connector uses Playwright with a pinned, packaged Chromium controlled by the engine. A real Chromium runtime gives the undocumented web login and AWS WAF flow the most mature JavaScript, cookie, network, and browser-context behavior available locally. Pinning the Playwright/browser pair also makes packaged behavior reproducible instead of inheriting an arbitrary system Chrome version.

The browser is an authentication resource, not a second application runtime. Each attempt uses an isolated temporary profile, returns only the resulting durable session state, and closes promptly. Routine Refresh uses the saved session and does not keep a browser alive when the protocol does not require one.

The larger application artifact is an accepted tradeoff for reliability. Cloud browser services are excluded because credentials and session material must remain local. Electron renderer reuse is excluded because the engine owns Connectors and Auto-refresh. Alternative local runtimes may be tested separately, but they do not enter the shipping path until they pass the same real login, WAF, session-rotation, packaging, and cleanup contract.
