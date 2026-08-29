# Local HTTP MCP reads the unlocked Vault

Satella exposes one read-only MCP tool, `get_portfolio`, over Streamable HTTP at `http://127.0.0.1:3001/mcp`. A local agent authenticates with a Settings-issued MCP token as `Authorization: Bearer`. That token gates MCP only; loopback `/api` stays open for the UI. Screen lock does not block MCP. A Locked vault does. Connectors remain read-only, so Refresh and any write tools are out of scope.

## Considered Options

- **stdio `satella mcp`**: rejected because local harnesses would need the Satella binary on `PATH`.
- **Refresh as an MCP tool**: rejected because Refresh writes a Snapshot and hits custodians.
- **Require the MCP token on every `/api` route**: rejected; the web UI has no such credential after ADR 0009.
