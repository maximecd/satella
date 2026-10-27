# Satella

A private, local-first home for your financial life.

Satella combines bank accounts, brokerage accounts, exchanges, and on-chain wallets into one portfolio that runs entirely on your machine. Your data lives in an encrypted Vault on disk. No account, no cloud, no telemetry.

> Status: experimental personal project, built to explore local-first architecture and connector design. It is not a supported product. See [Disclaimer](#disclaimer) before using it with real accounts.

## Features

- **Unified portfolio**: Total assets, Net worth, allocation by asset category, value history with per-category stacked areas, and the largest holdings with their recent change.
- **Connectors**: read-only sync for Interactive Brokers (Flex Web Service), Kraken, OKX, and EVM wallets (native balance plus tracked ERC-20 tokens). Manual accounts cover everything else.
- **Market data**: prices from Yahoo Finance and CoinGecko, with ISIN discovery and a broker-ticker fallback.
- **Auto-refresh**: an engine-side scheduler refreshes every synced custodian and records a sanitized Sync log.
- **Debts and Goals**: manual debts feed Net worth. Goals track selected accounts against a target amount without changing totals.
- **Encrypted Vault**: Argon2id-derived key, AES-256-GCM over the whole database file, a four-digit Screen lock, and encrypted Vault export and restore.
- **MCP access**: a read-only `get_portfolio` tool over Streamable HTTP lets a local AI agent read the unlocked Vault with a Settings-issued token.
- **English and French**, chosen during onboarding and stored in the Vault.

## Architecture

Satella ships as a Node CLI (`satella`). It serves the web UI and the engine API on `127.0.0.1:3001` and opens the browser. A second start reopens the running instance.

```
apps/
  engine/     Effect HTTP API, Vault, SQLite persistence, refresh scheduler, MCP server
  web/        React 19 UI: Chakra UI v3, TanStack Router/Query/Form, Recharts, i18next
packages/
  connector-core/     Shared connector contract and errors
  connector-ibkr/     Interactive Brokers Flex queries (XML)
  connector-kraken/   Kraken private REST API, serialized for nonce order
  connector-okx/      OKX REST API
  connector-evm/      EVM chains through viem
tools/oxlint/anti-slop/   Custom Oxlint rules for safer TypeScript
```

### Vault security

- While unlocked, the database is an in-memory `node:sqlite` instance. At rest it is one AES-256-GCM blob, so connector credentials never touch disk in plaintext, even after a crash.
- The data-encryption key is wrapped with a key derived from the Vault password by Argon2id (64 MiB, 3 passes). Satella cannot recover a forgotten password.
- No native addons and no install scripts, so `npx` never compiles anything.
- Schema migrations are sealed with SHA-256 checksums. `pnpm check` rejects edited, reordered, or unregistered migrations.

The reasoning behind these choices is recorded in [`docs/adr/`](docs/adr). [`CONTEXT.md`](CONTEXT.md) defines the domain language.

## Tech stack

TypeScript, [Effect 4](https://effect.website), React 19, Chakra UI v3, TanStack Router/Query/Form, Recharts, `node:sqlite`, viem, Vite+ (Vite, Vitest, Oxlint, Oxfmt), pnpm workspaces, and GitHub Actions for CI, nightly prereleases, and gated releases.

## Getting started

Requirements: Node **≥ 26.1.0** (see `.nvmrc`) and pnpm **11.21.0**.

```sh
nvm use
pnpm install
pnpm dev      # engine + web with Vite HMR and a worktree-local .satella Vault
pnpm start    # production build served on http://127.0.0.1:3001
```

`pnpm db:seed` fills the development Vault with sample holdings and faked price history.

The production Vault lives in `~/.satella`. Development keeps a `.satella` directory inside each worktree, so branches never share data.

## Commands

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `pnpm check`         | Layout + Effect-version guards, then format/lint/typecheck |
| `pnpm format`        | Format the repository                                      |
| `pnpm lint`          | Lint with the shared Vite+ policy                          |
| `pnpm typecheck`     | Typecheck every workspace                                  |
| `pnpm test`          | Run every workspace test once                              |
| `pnpm test:watch`    | Watch tests                                                |
| `pnpm test:coverage` | Coverage for every source-owning workspace                 |
| `pnpm build`         | Build/pack workspaces in dependency order                  |
| `pnpm start`         | Build and run the product CLI                              |
| `pnpm dev`           | Start engine and web with Vite HMR                         |

Release packaging and the nightly pipeline are described in [`docs/releasing.md`](docs/releasing.md).

## How this project is built

Satella is built with AI coding agents under a written process. [`AGENTS.md`](AGENTS.md) holds the repository rules, `.scratch/` holds the specs and issues each feature started from, `docs/adr/` records decisions, and `docs/research/` keeps the API investigations behind the connectors.

## Disclaimer

Satella is an experiment. It is shared for learning and demonstration only.

- **No financial advice.** Nothing in this project recommends, endorses, or discourages any investment, asset, or financial decision. Figures it shows may be incomplete, delayed, or wrong.
- **No endorsement or affiliation.** Interactive Brokers, Kraken, OKX, Yahoo Finance, CoinGecko, and every other institution or service named here are used as integration targets only. This project is not affiliated with, sponsored by, or endorsed by any of them, and naming them does not mean I recommend them.
- **No warranty.** The software is provided as is, under the terms of the [MIT License](LICENSE). It has not been audited. You are responsible for any credentials you enter, any data you store, and any consequence of using it, including with third-party terms of service.
- **Prefer read-only credentials.** Connectors only read data. If you try them, create API keys with read-only permissions.

## License

[MIT](LICENSE)
