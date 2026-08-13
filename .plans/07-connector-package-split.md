# Connector Package Split Plan

## Goal

Split the current `@optimus/connectors` package so the connector contract is independent and every provider connector is its own npm package. Optimus should explicitly compose the connectors it ships, while a future user or downstream distribution can install, import, and register only the connector packages it wants.

The first target package set is:

| Package | Responsibility | Provider code included |
| --- | --- | --- |
| `@optimus/connector-core` | Public connector contract, schemas, errors, output validation, capability projection, and registry construction | None |
| `@optimus/connector-okx` | OKX credentials, client, schemas, assets, connector factory, and default connector instance | OKX only |
| `@optimus/connector-ibkr` | IBKR Flex credentials, client, parser, schemas, assets, connector factory, and default connector instance | IBKR only |

Do not retain an umbrella package that depends on and re-exports every provider. Such a package would make installing one connector install all built-ins and would recreate the coupling this change is intended to remove.

## Current-State Findings

Today `packages/connectors` combines four concerns:

- shared connector types and output validation in `src/connector.ts`;
- generic registry/capability helpers in `src/registry.ts`;
- OKX and IBKR implementations, runtime dependencies, tests, instructions, and icons;
- the concrete built-in registry that imports both providers.

This creates several practical problems:

- consumers cannot depend on the contract without also installing both implementations and their transitive dependencies;
- provider-only dependencies such as `saxes` are installed for unrelated connectors;
- the engine imports one package for both the contract and a hard-coded global registry;
- root build, typecheck, and development scripts name the monolithic package directly;
- adding another connector requires editing the monolith's exports, asset-copy behavior, tests, and root tooling.

The split should remove those assumptions rather than only move files into more folders.

## Package Boundaries

Use sibling workspace packages so pnpm can infer the build graph from package dependencies:

```text
packages/
  connector-core/
    src/
      connector.ts
      registry.ts
      index.ts
    test/
      connector.test.ts
      registry.test.ts
    package.json
    tsconfig.json
    vitest.config.mjs
  connector-okx/
    src/
      client.ts
      connector.ts
      schemas.ts
      index.ts
      icon.svg
      instructions.md
    test/
      okx.test.ts
    package.json
    tsconfig.json
    vitest.config.mjs
  connector-ibkr/
    src/
      client.ts
      connector.ts
      parser.ts
      schemas.ts
      index.ts
      icon.svg
      instructions.md
    test/
      ibkr.test.ts
      fixtures/
        ...
    package.json
    tsconfig.json
    vitest.config.mjs
```

The workspace already includes `packages/*`, so these directories require no workspace-glob change.

### `@optimus/connector-core`

Move the provider-neutral contents of `connector.ts` here. Keep Effect schemas, connector error types, the `Connector`, `AuthenticatedConnector`, and output data contracts, and `validateConnectorOutput` in this package.

Move only generic registry behavior from `registry.ts`:

- `ConnectorCapability`;
- `ConnectorRegistry`;
- validation that IDs are non-empty and asset classes are declared;
- capability projection;
- `connectorRegistryFrom`.

Strengthen registry construction while it is being made public:

- reject duplicate connector IDs instead of silently letting `Map` keep the last entry;
- reject empty or whitespace-only IDs and names;
- keep registry iteration order equal to the caller's explicit connector order;
- return an immutable/read-only registry API to consumers;
- derive public capability data from the constructed registry so discovery and execution cannot drift.

Do not import OKX, IBKR, Node filesystem APIs, or provider-specific dependencies from core. Do not expose a `BuiltinConnectorRegistry` or `BUILTIN_CONNECTOR_CAPABILITIES` constant from core because built-in selection belongs to the application composition root.

Treat `@optimus/connector-core` as the public authoring surface for future custom connectors. Its root export should be sufficient for a third-party package to implement and type-check a connector without importing engine, database, web, or another provider package.

### Provider packages

Each provider package owns all code and static assets required by that provider and exports:

- its credentials schema and useful public credential type;
- its connector options and connector factory for testing or customized transports;
- its default connector instance;
- provider client/parser/schema exports that are intentionally public today.

Update provider-relative imports such as `../connector.js` to import the public contract from `@optimus/connector-core`. Provider packages must not import each other or the engine.

Keep runtime dependencies narrow:

| Package | Runtime dependencies |
| --- | --- |
| `@optimus/connector-core` | `effect` |
| `@optimus/connector-okx` | `@optimus/connector-core`, `@effect/platform`, `effect` |
| `@optimus/connector-ibkr` | `@optimus/connector-core`, `@effect/platform`, `effect`, `saxes` |

Confirm the exact imports after the move and do not copy a dependency into a manifest merely because it existed in the old package. Declare `@optimus/connector-core` with a workspace range that pnpm can rewrite to a normal semver range when packed or published; avoid publishing a manifest with an unusable workspace-only reference.

## Application Composition

Create one engine-owned composition module, for example `apps/engine/src/finance/connectors.ts`, that explicitly imports `OkxConnector` and `IbkrConnector`, constructs the default registry with `connectorRegistryFrom`, and derives its capabilities.

```ts
import { connectorCapabilities, connectorRegistryFrom } from "@optimus/connector-core";
import { IbkrConnector } from "@optimus/connector-ibkr";
import { OkxConnector } from "@optimus/connector-okx";

export const CONNECTOR_REGISTRY = connectorRegistryFrom([OkxConnector, IbkrConnector]);
export const CONNECTOR_CAPABILITIES = connectorCapabilities(CONNECTOR_REGISTRY);
```

This is static, trusted composition. Dynamic loading of arbitrary package names, downloading packages at runtime, user-supplied JavaScript execution, sandboxing, and a connector marketplace are explicitly out of scope. The structure should make a later custom build straightforward: install a connector package, import its connector in this one module, and add it to the ordered list.

Update the engine so:

- contract-only code imports types and errors from `@optimus/connector-core`;
- the engine package declares direct workspace dependencies on core, OKX, and IBKR;
- connector discovery and sync use the same engine-owned registry instance;
- `config.ts` no longer reaches into a connector package for a global built-in list;
- no web or desktop package imports provider implementations directly.

Prefer passing the registry into registry-dependent functions or exposing it through a small engine-owned catalog abstraction rather than hiding another hard-coded provider global inside `connector-service.ts`. Keep a default composed catalog for the normal app, while making the sync logic testable with a registry containing a synthetic connector. This is the seam a future custom distribution will use.

## npm Package Shape and Exports

Give every new package a complete, independently valid manifest:

- unique scoped `name` and package-local `version`;
- ESM `type`, `main`, `types`, and an explicit `exports` map;
- `files` restricted to `dist` plus any deliberately shipped metadata;
- package-local `build`, `dev`, `typecheck`, and `test` scripts;
- accurate `dependencies` and `devDependencies`;
- `sideEffects: false` only after confirming module initialization has no required side effects;
- the repository's license/repository metadata when it exists or is introduced.

Keep packages private during the structural migration if the repository is not ready to publish. “npm package” here means a real independently packable package boundary; publishing to a registry, choosing public versions, release automation, provenance, and npm access configuration are a separate release decision.

Use a narrow root export for each package. Avoid deep-import contracts into `dist` or `src`; consumers must import only documented export-map paths. Make the default instance and factory names provider-specific so several connector packages can be imported together without aliases.

## Static Assets

Each provider package must ship its own `instructions.md` and `icon.svg` beside the compiled module path expected by `import.meta.url` and `readFileSync`.

Replace the monolith-specific copy script with a reusable workspace script, such as `scripts/copy-package-assets.mjs`, that:

- operates on the calling package's explicit source and destination directories;
- copies only an allowlist of `.md` and `.svg` assets while retaining relative paths;
- fails clearly when its source directory is missing;
- never scans or writes outside the invoking package;
- is used by both provider build scripts after TypeScript compilation.

Alternatively, keep a tiny copy script in each package if sharing it makes invocation or publishing less reliable. Do not publish references back to repository files outside the package.

Add post-build/package tests that import each connector from its built package entry and assert that its data-URI icon and Markdown instructions load. Unit tests that import `src` alone are insufficient because they do not catch missing assets in `dist` or the packed tarball.

## Build and Development Tooling

Remove hard-coded knowledge of `@optimus/connectors` from root and engine scripts. Let pnpm's workspace dependency graph determine ordering.

### Root scripts

Change root orchestration so normal commands cover all packages and applications, including future connectors, without adding every new package name:

- `build`: run workspace builds recursively in topological order;
- `typecheck`: run every workspace's typecheck in dependency order;
- `test`: run every workspace's tests, not only the web tests;
- `test:coverage`: either run coverage in every workspace that defines it or clearly retain an app-specific command under a specific name;
- `format`, `format:check`, and `lint`: continue operating from the repository root;
- use `--if-present` only where a workspace legitimately may not define a script; do not let it conceal a missing required script on one of the connector packages.

Remove engine `prebuild`, `pretypecheck`, and `pretest` hooks that rebuild connector packages redundantly when the root recursive command already follows the dependency graph. Package-local direct commands should use an explicit pnpm dependency selector or documented prerequisite rather than recursively invoking the same lifecycle and building dependencies twice.

### Development watch mode

Update `scripts/dev.mjs` to start watch builds for all workspace packages needed by the engine rather than naming one monolith. Build the dependency closure once before watchers and applications start so the engine never boots against missing `dist` files. Then run package watchers in parallel with engine, web, and desktop processes under the existing fail-fast process supervisor.

Update the engine's `tsx watch --include` paths to cover all connector package output directories, including core. Verify changes in core and either provider trigger an engine restart, and that adding a future `packages/connector-*` workspace does not require another hard-coded watch process.

Avoid an ordering race in which engine starts while a provider's first compile or asset copy is incomplete. The initial topological build is the readiness barrier; watch processes only handle subsequent edits.

### TypeScript project behavior

Give every package its own `rootDir`, `outDir`, declarations, NodeNext module settings, and include list. Rely on package imports and built declarations across package boundaries rather than TypeScript path aliases that bypass package exports.

Use clean builds in verification so stale files from the old monolith cannot make imports appear to work. Ensure the old `packages/connectors/dist` directory is not required by any command after migration.

## Tests and Verification

Redistribute existing tests by ownership:

- generic output validation and registry tests move to `connector-core`;
- OKX tests move unchanged in behavior to `connector-okx`;
- IBKR tests and fixtures move unchanged in behavior to `connector-ibkr`;
- engine tests cover the explicit default composition, public capabilities, unknown connector handling, and injection of a synthetic registry.

Add coverage for the new boundaries:

1. Core can build and test without either provider installed in its dependency graph.
2. Each provider can build and test with only core plus its own declared dependencies.
3. Duplicate connector IDs cause registry construction to fail deterministically.
4. Default engine registry order and capabilities remain OKX then IBKR, preserving current UI behavior.
5. Sync lookup and capability discovery are derived from the same registry.
6. A synthetic/custom connector can be composed into a test registry without modifying core.
7. Built provider entry points load successfully from `dist` with their Markdown and SVG assets present.
8. `pnpm pack --dry-run` (or `pnpm pack` into a temporary directory) for each package contains declarations, JavaScript, instructions, and icon, and does not contain another provider's files, tests, source, secrets, or fixtures.
9. Import smoke tests run against the packed package shape or built export map, not relative source paths.
10. Full root `build`, `typecheck`, `lint`, `format:check`, and `test` commands succeed from a clean checkout.
11. `pnpm dev` starts from clean build output and restarts the engine after edits to core, OKX, and IBKR.

Keep network calls mocked in connector tests. Packaging verification must not authenticate against real providers and must never include real credentials or account data.

## Migration Sequence

### 1. Extract core

- Create `packages/connector-core` and its manifest/configuration.
- Move the connector contract, shared errors/schemas, output validation, and generic registry helpers.
- Add the stronger registry invariants and core-owned tests.
- Confirm core has no provider or Node asset-loading dependency.

### 2. Extract OKX

- Create `packages/connector-okx` with only OKX code, tests, instructions, and icon.
- Replace relative shared-contract imports with `@optimus/connector-core`.
- Declare only OKX's runtime dependencies.
- Build and run OKX tests independently, including asset loading from output.

### 3. Extract IBKR

- Create `packages/connector-ibkr` with only IBKR code, tests, fixtures, instructions, and icon.
- Replace relative shared-contract imports with `@optimus/connector-core`.
- Keep `saxes` scoped to this package.
- Build and run IBKR tests independently, including asset loading from output.

### 4. Move composition into the engine

- Add the engine connector composition/catalog module.
- Replace all `@optimus/connectors` imports with core or the appropriate provider package.
- Make discovery and execution share the composed registry.
- Update engine manifest dependencies and add composition/injection tests.

### 5. Generalize tooling

- Introduce reliable per-package asset copying.
- Replace hard-coded root build/typecheck/test scripts with dependency-aware workspace commands.
- Update clean-start and watch-mode orchestration for every connector package.
- Update the lockfile after manifests are final.

### 6. Remove the monolith

- Delete `packages/connectors` only after imports, tests, scripts, and lockfile references have moved.
- Search the repository, generated output excluded, for `@optimus/connectors`, `packages/connectors`, old subpath exports, and old build/watch paths; none should remain.
- Run verification from clean output so the deleted package cannot be resolved accidentally.

### 7. Verify package artifacts and the full application

- Inspect each package's packed file list and metadata.
- Run the full root quality suite.
- Start development mode and exercise connector discovery plus mocked/manual sync flows for both providers.
- Confirm the web still receives the same capabilities and the engine still rejects unknown connector IDs safely.

## Compatibility and Non-Goals

This repository is currently internal/private, so perform the package rename as one atomic workspace migration rather than maintaining a deprecated `@optimus/connectors` compatibility facade. If external consumers are discovered before implementation, add a separately time-boxed deprecation release; do not silently preserve the umbrella forever.

This phase does not:

- change connector IDs, credential fields, authentication, reconciliation, or UI behavior;
- add runtime connector discovery or accept arbitrary package names through the API;
- execute untrusted third-party code;
- define a remote registry, marketplace, signing model, or plugin sandbox;
- publish packages or establish a public versioning/release policy;
- combine provider packages through a convenience dependency that installs all connectors.

## Completion Criteria

The work is complete when:

- there is one implementation package per connector and one provider-free core package;
- installing either provider package does not install the other provider package;
- the engine explicitly owns and can replace its connector composition;
- connector discovery and sync use one registry;
- a new connector package can be added without editing core or enumerating it in root build/test scripts;
- each provider's built and packed output is independently usable and contains its required assets;
- no source, manifest, script, test, or lockfile entry refers to the old monolithic package;
- clean build, typecheck, lint, format check, full tests, pack smoke tests, and development watch verification all pass.
