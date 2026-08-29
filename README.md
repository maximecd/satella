# Satella

Personal finance workspace. Node **≥ 26.1.0** (repo `.nvmrc` pins the current toolchain), pnpm **11.21.0**, Vite+ **0.2.9**, Effect **4.0.0-rc.108**.

The product is a Node CLI. `pnpm start` serves the UI and API on `127.0.0.1:3001` and opens the browser. `pnpm dev` keeps Vite HMR and a worktree `.satella` Vault.

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

Use `nvm use` (or equivalent) so the local Node version matches `.nvmrc`.
