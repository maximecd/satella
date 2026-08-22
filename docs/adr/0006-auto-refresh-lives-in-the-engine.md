# Auto-refresh scheduling lives in the engine

Status: accepted

Auto-refresh repeats Refresh for every synced custodian at a fixed interval while the Vault is unlocked. We place that scheduler inside the engine process rather than the desktop shell: the engine already owns the refresh services, so an internal scheduler needs no self-issued HTTP calls and never crosses the renderer finance-access middleware, which intentionally rejects requests while the Screen lock is active. This also makes auto-refresh a property of the engine in every runtime — packaged desktop and development/web alike — instead of desktop-only behavior.

Consequence: background refresh continues during the Screen lock (the glossary's Screen lock entry already promises background work may continue), stops when the machine sleeps or the app quits, and performs no special catch-up after sleep beyond what its schedule naturally does.
