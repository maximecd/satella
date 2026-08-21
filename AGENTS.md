# AGENTS.md

Project-specific guidance for AI coding agents.

## Project status

Optimus is pre-production with no released installations or compatibility obligations. Prefer the clean target design; schema resets and breaking technical changes are acceptable without migration or backward-compatibility work.

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
