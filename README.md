# Satella

Personal finance workspace. Node **26.7.0**, pnpm **11.21.0**, Vite+ **0.2.9**, Effect **4.0.0-rc.108**.

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
| `pnpm dev`           | Start engine, web, and desktop with free ports             |

Use `nvm use` (or equivalent) so the local Node version matches `.nvmrc`.
