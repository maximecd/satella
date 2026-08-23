# Interactive Connector authentication separates transient secrets from saved sessions

Status: accepted

Connectors may require more than one user interaction before they can Refresh. The engine therefore owns an interactive authentication session that can start, request a challenge response, complete, expire, or be cancelled. The renderer receives an opaque attempt identifier and public challenge metadata, never an object that can directly control the Connector or browser.

Credential input used to prove identity, including a phone number, PIN, or one-time code, is transient. It remains in memory only for the active attempt and is never written to the Vault, logs, errors, or connector configuration. On successful authentication, the Connector returns durable session state to the engine. The engine encrypts that state in the Vault and persists later token rotation without giving the Connector database access.

An expired durable session places the Custodian in Re-authentication required instead of repeatedly attempting interactive login. Existing one-step Connectors complete the same protocol without returning a challenge.

Authentication attempts have a bounded lifetime and release their browser context and temporary profile on success, cancellation, timeout, Vault close, or engine shutdown. Screen lock does not close the Vault or invalidate durable sessions; established Auto-refresh may continue through it.
