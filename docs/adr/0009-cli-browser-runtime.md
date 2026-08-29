# CLI browser runtime

Status: accepted

Packaged Satella is a Node CLI (`@satella/app`, bin `satella`) that serves the web UI and engine API on `127.0.0.1:3001` and opens the system browser. The production Vault lives in `~/.satella`. Development keeps worktree `.satella`. Electron is not a runtime; there is no engine token.

This supersedes ADR 0004. Per-OS desktop artifacts and Electron `userData` ownership made `npx` impossible and were more packaging than an alpha needs. A second CLI start reopens the existing origin instead of starting a second engine.
