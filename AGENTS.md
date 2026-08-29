# AGENTS.md

Project-specific guidance for AI coding agents.

## Project status

Nightly installations contain persistent Vault data, so the migration lineage is permanent now. Preserve existing Vault data across every nightly and versioned update. Internal APIs and implementation details may still break freely.

The product runtime is a Node CLI (`@satella/app`, bin `satella`) that serves the web UI and engine API on `127.0.0.1:3001`. Production Vault data lives in `~/.satella`. `pnpm dev` keeps a worktree `.satella`. There is no Electron app and no engine token.

## Database migrations

- Never edit, rename, reorder, or delete a migration that has a `.sha256` sidecar.
- Add one file named `<UTC yyyymmddHHMMSS>_<name>.ts` under `apps/engine/src/database/migrations/` for each schema change. Use the actual creation time, not a sequence number copied from another branch.
- Register the migration in timestamp order in `ProductionMigrations`. When merging worktrees, keep every branch's migration and registry entry. If two files have the same timestamp, rename the later unpublished file before sealing it.
- Run `pnpm migration:seal` once the new migration is final and before staging it. The command seals only new untracked migration files. It refuses changed migrations and tracked migrations whose checksum was removed.
- Test both a fresh Vault and an upgrade from the last released schema. `pnpm check` rejects changed migrations, timestamp collisions, missing checksums, omitted registry entries, and incorrect order.

<!-- CHAKRA:START -->

Chakra UI v3 in `apps/web`. Wrap the tree in `Provider` from `src/components/ui/provider`.

RULES:

- Layout with Stack, Flex, Grid, SimpleGrid, Container — not raw spacing divs.
- Forms: wrap every input in Field; use PasswordInput for secrets and `PinField` for the four-digit Screen-lock PIN.
- Semantic tokens (`bg`, `fg.muted`, `border`) over raw palette/hex.
- Toasts via `notify` / `toaster` from `src/components/ui/toaster`.
- Compound snippets live in `src/components/ui/`.
- Wrap lucide-react icons in `Icon` with `asChild` so they inherit Chakra size and color.
- v3 props: `disabled` not `isDisabled`, `colorPalette` not `colorScheme`, `open` not `isOpen`.

<!-- CHAKRA:END -->

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Completion checks

Work is not complete until `pnpm check` passes.

Before reporting completion:

1. Run `pnpm check` from the repository root.
2. Fix every failure, then run `pnpm check` again.
3. Repeat until the command exits successfully.
4. Report the check result in the final response. If an unrelated pre-existing failure remains, include the exact failure.
