# CLI browser runtime

Status: ready-for-agent

## Problem Statement

Launching Satella today means building an Electron app per OS, or running a desktop-plus-engine pair from the repo. That is too much packaging for an alpha that should start with one Node command, open in the browser, and work for anyone who has a current Node LTS. Native SQLCipher compile scripts make `npx` a non-starter. The existing nightly Electron Vault can be abandoned.

## Solution

Ship Satella as one Node CLI. One process serves the HTTP API and the built web UI on loopback, then opens the system browser. The published package name is `@satella/app` with bin `satella`. npm registry publish is prepared but not turned on; a maintainer launches a release by packing the npm tarball and, for Ship, attaching it to a GitHub prerelease.

The production Vault lives in the user's home `.satella` directory. `pnpm dev` keeps a separate worktree `.satella`. The whole Vault file is encrypted at rest with the existing Argon2id plus AES-256-GCM envelope; runtime SQLite is Node's builtin module in memory. No native addon, no install script. Electron and the desktop app are removed.

Picsou's bar is field-level AES-256-GCM on Connector credentials with an env key. This design uses the same primitive on the entire Vault, with the Vault password as the secret instead of an env key sitting next to the files.

## User Stories

1. As a person with Node LTS installed, I want to start Satella with one command and get the UI in my browser, so that I do not install an OS-specific desktop app.
2. As a person running Satella, I want one process to serve both the interface and the engine API, so that I am not managing two ports or two children.
3. As a person running Satella, I want the command to open my default browser on the local app, so that I do not copy a URL by hand.
4. As a person who closes the browser tab, I want the CLI to keep running, so that Refresh and Screen lock continue until I stop the command.
5. As a person who is done, I want Ctrl+C in the terminal to stop Satella, so that the Vault closes and the next start asks for the Vault password.
6. As a person who runs the command while Satella is already running, I want the existing browser target reopened and the second command to exit successfully, so that two engines never share one Vault.
7. As a person whose port 3001 is taken by something that is not Satella, I want a clear failure, so that I am not talking to the wrong process.
8. As a person on another machine with Node LTS, I want `npx @satella/app` to work once the package is published, with no compile step and no install scripts, so that SQLCipher toolchains are not my problem.
9. As a maintainer who has not published to npm yet, I want to pack the same artifact locally and run it with `npx` on the tarball, so that a release is exercisable before a registry account is wired.
10. As a maintainer, I want Ship to attach that tarball to a GitHub prerelease, so that I can `npx` the release asset URL without npm.
11. As a maintainer, I want `pnpm start` in the clone to run that same one-process CLI and open the browser, so that the repo launch path matches the product.
12. As a developer, I want `pnpm dev` to keep Vite HMR and a worktree-local Vault, so that hacking does not rebuild a bundle or touch the real portfolio.
13. As a user of the product CLI, I want my Vault in `~/.satella`, so that the portfolio is per OS user, not per working directory.
14. As a developer, I want `pnpm dev` to keep using `<worktree>/.satella`, so that resetting a worktree cannot wipe the home Vault.
15. As a user, I want Satella to ignore the old Electron `Application Support/Satella` Vault, so that the CLI does not surprise-open abandoned nightly data.
16. As a user, I accept that a SQLCipher-era `.satella-vault` may not Restore, so that the new at-rest format is not blocked on a migrator.
17. As a user creating a Vault, I want the Vault password to wrap a random database key with Argon2id and AES-256-GCM, so that forgetting the password remains irrecoverable and files on disk stay ciphertext.
18. As a user with a locked or stopped Vault, I want Connector credentials, Positions, Screen-lock PIN material, and the rest of the Vault unreadable on disk, so that copying `~/.satella` without the Vault password is useless.
19. As a user whose process is killed hard, I want the files on disk to remain ciphertext, so that "encrypted at rest" does not mean "if you quit cleanly".
20. As a user, I accept that a hard kill may drop the last unpersisted Refresh, so that we do not keep a plaintext working copy on disk while unlocked.
21. As a user unlocking the Vault, I want the same unlock, Lock, and Reset flows as today, so that the CLI change is a runtime change, not a new security UX.
22. As a user with Satella running, I want Screen lock to still hide the interface while Auto-refresh continues, so that Lock is not confused with stopping the CLI.
23. As a user exporting a Vault, I want a browser download of one `.satella-vault` file protected by the current Vault password, so that recovery does not need a native save dialog.
24. As a user restoring a Vault, I want to pick a `.satella-vault` file in the browser, so that Welcome and Unlock can recover without an OS file dialog.
25. As a user, I want Vault export and restore to keep including portfolio, custodians, Connector credentials, and Screen-lock settings, so that recovery still replaces the whole Vault.
26. As a local process on the same machine, I can call the loopback API without an engine token, so that the CLI stays simple; the Vault password still gates decrypted data until Unlock.
27. As a user, I want the engine bound only to `127.0.0.1:3001`, so that the app is not offered on the LAN.
28. As a user, I want the web UI and API on the same origin in the product CLI, so that the browser talks to `/api` without a baked-in engine URL.
29. As a developer in `pnpm dev`, I want the existing split (Vite plus engine) with CORS for the Vite origin, so that HMR keeps working.
30. As a user, I want Connector sync (Kraken, OKX, IBKR, EVM wallets) to keep working, so that dropping SQLCipher and Electron does not drop finance features.
31. As a user, I want existing Vault migrations to keep applying to a newly created CLI Vault, so that schema history stays append-only for data created after this change.
32. As a maintainer, I want the desktop app, Electron packaging, nightly ZIP workflow, and packaged-desktop smoke test gone, so that CI and `pnpm start` cannot pretend Electron is still the product.
33. As a maintainer, I want the npm package to declare a Node LTS engine range in which `node:sqlite` works without a feature flag, so that we stop pinning an exact Current release.
34. As a maintainer, I want packing `@satella/app` to be a real `npm pack` tarball (engine, web build, connectors, no native addon), so that flipping npm publish later is configuration, not a rewrite.
35. As a maintainer, I want automatic Electron nightlies stopped, so that GitHub Releases are not still shipping `.app` ZIPs.
36. As a maintainer, I want Ship to keep choosing the next `0.x` patch and publishing an immutable GitHub prerelease, with the tarball as the artifact instead of a macOS ZIP.
37. As a tester given a GitHub prerelease, I want to run that tarball with `npx` and Node LTS only, so that I am not cloning the monorepo.
38. As a user of the web UI, I want Export, Restore, and language reporting to work without `window.satellaRuntime`, so that deleting the desktop preload does not leave dead buttons.
39. As a user, I want tray, Dock, and native window lifecycle gone without leftover errors, so that the UI does not call missing desktop APIs.
40. As a maintainer, I want AGENTS.md, release docs, and ADRs 0002 and 0004 updated to the CLI boundary, so that agents do not keep packaging Electron or SQLCipher.

## Implementation Decisions

- The product runtime is a Node CLI named `satella`, published as `@satella/app`. Workspace packages may keep the `@satella-app/*` names internally. The published name and the bin are what users type.
- npm publish is not hooked to CI yet. Packing the tarball is required. Ship attaches it to the GitHub prerelease. Local `npx` on that tarball is the release launch path until the registry is enabled.
- Default listen address is `127.0.0.1:3001`. Occupied by a live Satella owner: reopen the browser and exit 0. Occupied by anything else: fail. No port hunt in the product CLI.
- One process serves the built web app and the existing engine HTTP API. Product UI uses same-origin `/api` routes. Development keeps Vite plus engine and the existing CORS web origin.
- Engine token authentication is removed. Loopback plus Vault password is the boundary. Any local process can hit the API; decrypted Connector credentials exist only after Unlock, in process memory.
- Production Vault directory is `~/.satella` (OS home). Development with the development database context stays worktree `.satella`. Tests keep injecting an isolated absolute data directory. The CLI does not read Electron `userData`.
- Delete the desktop application and all Electron packaging: builder, nightly ZIP, packaged-app smoke, Electron-only root scripts, and native rebuild for Electron. `pnpm start` becomes the product CLI.
- Replace SQLCipher with `node:sqlite` (builtin). No native dependency and no package install script for crypto or SQLite.
- Keep the existing envelope: random 256-bit DEK, Argon2id (1.3) KEK from the Vault password, AES-256-GCM wrap, versioned envelope file beside the Vault. Finance code keeps using Effect `SqlClient`.
- While the Vault is open, SQLite lives in memory. After writes, and on Lock-close of the database / process exit, serialize and atomically replace the ciphertext file using the DEK. Disk in `~/.satella` is ciphertext whenever the process is not mid-replace. A hard kill may lose the last unpersisted write; it must not leave a plaintext database file.
- Internal backups and `.satella-vault` export use the same whole-file ciphertext, not SQLCipher `VACUUM INTO`. New exports are not required to open on a SQLCipher-era binary, and the reverse is not required.
- Vault export in the UI is a browser download. Vault restore is a browser file pick that sends the artifact to the engine. Engine path-based export/restore may remain as an internal test seam.
- Optional `window.satellaRuntime` desktop bridges go away. Screen-lock activity, language, and cache clearing that used IPC move into the web app or become no-ops where they only existed for Electron.
- Node engine range is "current LTS and newer" where `node:sqlite` needs no feature flag (22.13+ is the floor on today's lines). Drop the exact `26.7.0` product pin. Dev tooling may still use the repo `.nvmrc`.
- Connectors stay bundled in the CLI package. No separately installed connector plugins.
- ADR 0004 is superseded by a CLI-owns-the-engine-and-home-Vault decision. ADR 0002 is superseded on the storage cipher (SQLCipher out, whole-file AES-GCM plus `node:sqlite` in); the envelope and Vault-password story remain.
- No CONTEXT.md glossary change. Vault, Vault password, Screen lock, Connector, and Vault export/restore keep their meanings. Home path, npm, and SQLite are delivery details.

## Testing Decisions

- Tests assert external behavior: process in, HTTP and files out. They do not assert AES helper internals, bundler graph, or workflow YAML layout.
- There is one product seam: spawn the CLI the same way a tarball would (the packed bin, or the built entry it wraps) with a temporary home/data directory. That process must bind `127.0.0.1:3001`, serve the UI at `/`, serve `/api/hello` without a token, create Vault files that are not a readable SQLite database while locked, unlock with the Vault password over HTTP, persist ciphertext after a write, and refuse a second overlapping start by exiting 0 without taking ownership.
- Existing spawned-engine Vault HTTP tests are prior art for unlock, wrong password, export, restore, reset, and ownership. Adapt them to in-memory SQLite plus whole-file ciphertext. They remain the crypto and lifecycle seam; do not add a second parallel Vault server stack.
- Existing database-config and development-database tests are prior art for home vs worktree vs injected test directories and for `engine.lock`. Point production resolution at home `.satella` when the CLI runs without a development context.
- Packing is tested at the pack command: the tarball includes the bin, the web build, and connectors, and it does not depend on a native addon or an install script. A smoke that `npx`s the tarball in an isolated prefix is the release seam that replaces the Electron `.app` smoke.
- Do not keep desktop, tray, or Electron main-process tests. Delete them with the desktop app.
- Prior art to follow: packaged-runtime smoke (process, health endpoint, isolated data dir, cleanup), Vault process HTTP suite, engine token suite (replace with unauthenticated loopback assertions), ownership tests.

## Out of Scope

- Publishing `@satella/app` to the npm registry, npm tokens, or dist-tags.
- Recovering or migrating Electron `userData` Vaults or SQLCipher `.satella-vault` files.
- Engine tokens, Electron navigation lockdown, tray, auto-start, or a background OS service.
- Hosting the UI on another origin (CDN, GitHub Pages) talking to localhost.
- Field-level encryption only (Picsou's model), SQLCipher prebuilds, WASM SQLite, or Turso.
- Changing finance domain behavior, Connector protocols, or the migration append-only rule for Vaults created after this change.
- Windows/Linux installers, Homebrew, App images, or a return to per-OS Electron artifacts.
- Apple signing, notarization, or Gatekeeper work (there is no `.app`).
- Remote access, bind-on-LAN, or authenticating browsers on other machines.

## Further Notes

- Picsou encrypts credential columns with AES-256-GCM and a `CRYPTO_ENCRYPTION_KEY` env var; the rest of Postgres is plaintext. Matching that bar on credentials and then covering the whole Vault is intentional, not a Picsou clone. The Vault password replaces the env key because this is a local CLI, not a self-hosted server with a separate `.env`.
- Unscoped npm name `satella` is already a dead Discord wrapper. Do not block on reclaiming it. `npx @satella/app` is the command. Global install still exposes the `satella` bin.
- Loopback without a token is a real local-malware hole while the Vault is unlocked. That was accepted to keep launch simple. Disk theft without the Vault password is the threat this spec actually closes.
- Nightly ZIP existed because replacing `Satella.app` was heavy. A tarball plus later `npx @satella/app@nightly` can come back; it is not part of this change.
