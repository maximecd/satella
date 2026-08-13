# Connector Package Split Plan

## Goal

Replace the monolithic `@optimus/connectors` workspace with one provider-free authoring package and one independently buildable package per provider:

| Package | Responsibility |
| --- | --- |
| `@optimus/connector-core` | Connector contracts, schemas, errors, output validation, registry construction, and capability projection |
| `@optimus/connector-okx` | OKX credentials, client, schemas, connector factory/default instance, instructions, and icon |
| `@optimus/connector-ibkr` | IBKR Flex credentials, client, parser, schemas, connector factory/default instance, instructions, and icon |

Do not keep an umbrella package or compatibility facade. The engine is the application composition root and explicitly selects the providers Optimus ships.

## Current Architecture Standards

This plan follows the tooling and Effect architecture established by plan 08:

- Effect 4 imports come directly from supported `effect/*` and `effect/unstable/*` exports; packages must not add local Effect re-export modules.
- Every workspace uses Vite+ for pack, test, coverage, formatting, and lint integration.
- Tests are colocated with their subject and use only `.test.ts`; do not create `test/` trees or suffixes such as `.integration.test.ts`.
- Each package has one `vite.config.ts` merged with the root config and one package-local `tsconfig.json`.
- Root recursive commands discover packages from the workspace graph; they must not enumerate connector package names.
- Do not add CI configuration or general-purpose tooling scripts for this split.
- Coverage floors are measured package baselines and should be ratcheted upward as tests grow.

## Package Boundaries

```text
packages/
  connector-core/
    src/
      connector.ts
      registry.ts
      registry.test.ts
      index.ts
    package.json
    tsconfig.json
    vite.config.ts
  connector-okx/
    src/
      client.ts
      connector.ts
      connector.test.ts
      schemas.ts
      icon.svg
      instructions.md
      index.ts
    package.json
    tsconfig.json
    vite.config.ts
  connector-ibkr/
    src/
      client.ts
      connector.ts
      connector.test.ts
      parser.ts
      schemas.ts
      icon.svg
      instructions.md
      index.ts
    package.json
    tsconfig.json
    vite.config.ts
```

### Core

`@optimus/connector-core` is the complete third-party connector authoring surface. It exports connector types, credential metadata, account/asset schemas, connector errors, output validation, the read-only registry API, registry construction, and capability projection.

Core must not import a provider, the engine, Node filesystem APIs, or provider-only dependencies. Registry construction must:

- reject duplicate IDs;
- reject empty IDs and names;
- require at least one declared asset class;
- preserve caller order;
- expose no mutation methods;
- derive discovery capabilities from the same registry used for lookup.

### Providers

Each provider imports the public contract only from `@optimus/connector-core`. Providers never import one another or engine code. Each root export intentionally exposes its credentials/schema types, client/parser surface, connector factory, and provider-named default connector.

Runtime dependencies remain narrow:

| Package | Runtime dependencies |
| --- | --- |
| core | `effect` |
| OKX | core, `effect` |
| IBKR | core, `effect`, `saxes` |

Provider Markdown and SVG source use the Vite+ pack text loader and are embedded in the built JavaScript. This keeps runtime asset loading reliable without filesystem reads, copied asset directories, or new scripts. Package tests assert that the exported default connector contains usable instructions and a data-URI icon.

## Package Shape

Each package is private during this migration but independently packable:

- ESM package with `main`, `types`, and an explicit root `exports` map pointing to `dist`;
- `files: ["dist"]` and no source/tests in the tarball;
- package-local `build`, `dev`, `test`, `test:watch`, `test:coverage`, and `typecheck` commands;
- dependency imports externalized from the bundle while provider-owned code and raw assets are bundled;
- workspace dependencies declared with `workspace:*`, which pnpm rewrites in packed manifests;
- no deep imports into another package's `src` or `dist`.

## Engine Composition

`apps/engine/src/finance/connectors/registry.ts` is the only built-in selection point. It imports OKX and IBKR, constructs the ordered registry, and derives public capabilities from that registry.

Contract-only engine code imports from core. Discovery and synchronization share the composed registry. Registry-dependent helpers accept a registry so tests and custom distributions can supply a synthetic selection without editing core or a provider.

No web or desktop source imports provider packages. Runtime package discovery, downloading packages, arbitrary package names, untrusted code execution, marketplaces, and plugin sandboxing remain out of scope.

## Build and Development

Root `vp run -r` commands use workspace dependencies to build and verify packages in topological order.

Package exports point at `dist`, so development establishes one complete connector-package build before applications start. The existing development supervisor then starts one generalized `packages/connector-*` watch command with cleaning disabled, the engine, web, and desktop. This prevents each watcher's initial compilation from deleting the ready output. Engine `tsx watch` includes connector package output so changes to core or either provider restart it. Adding a future `connector-*` workspace requires no root-script enumeration.

The old `packages/connectors` directory, package name, copy-assets script, build output, and watch paths must be removed completely.

## Verification

Required checks:

1. Core builds and tests without provider dependencies.
2. Each provider builds and tests with only core and its own dependencies.
3. Duplicate IDs and incomplete registry metadata fail deterministically.
4. Engine composition order remains OKX then IBKR.
5. Discovery and execution reference the same registry.
6. A synthetic connector registry can be composed without changing core.
7. Provider tests verify embedded Markdown and icon exports without network access.
8. Packed tarballs contain only package metadata and `dist`, import successfully, and contain no other provider, tests, fixtures, secrets, or source.
9. No non-generated repository file refers to `@optimus/connectors` or `packages/connectors`.
10. Root check, test, coverage, build, test-watch, and dev workflows pass under Node 26.7.0.
11. Dev mode starts engine, web, connector watchers, and Electron; connector output changes cause an engine restart.

## Non-Goals

- No connector behavior, IDs, credential fields, authentication, reconciliation, or UI changes.
- No compatibility umbrella.
- No publishing, release automation, provenance, npm access policy, CI, or marketplace work.
- No runtime installation or execution of arbitrary connector packages.

## Completion Criteria

The split is complete when there is one provider-free core package and one package per provider; the engine explicitly owns replaceable composition; package artifacts are independently usable; root orchestration discovers current and future connector packages; the monolith has no remaining references; and all verification above passes.
