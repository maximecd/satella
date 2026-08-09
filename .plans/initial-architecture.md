# Initial Architecture Plan

## Goal

Build a private, local-first finance application around a standalone Node.js wealth engine.

The engine can run either:

- as a child process managed by the desktop application; or
- as a standalone Node.js application on infrastructure controlled by the user.

The same web frontend connects to the engine in both cases.

## Keep the Initial Scope Small

The initial architecture contains only three applications and one shared package:

```text
apps/
  engine/       Standalone Node.js wealth engine
  web/          React SPA
  desktop/      Electron shell

packages/
  connectors/   Connector definition and built-in connectors
```

Do not introduce additional shared packages until a concrete need appears.

## Workspace Tooling

Use the Oxc toolchain across the entire workspace:

- Oxlint for linting;
- Oxfmt for formatting;
- TypeScript for type checking.

Do not add ESLint or Prettier. Keep the shared lint and format configuration at the workspace root so every application and package follows the same rules.

In particular, the initial architecture does not include:

- a CLI;
- SSR;
- a project-operated backend or cloud service;
- a runtime plugin marketplace;
- a shared UI package;
- a custom design system;
- a separate test utilities package;
- live multi-device synchronization;
- mobile applications.

## Applications

### `apps/engine`

The engine is a standalone Node.js application written in TypeScript and Effect.

It owns:

- the financial domain model;
- wealth calculations and normalization;
- persistence and database migrations;
- vault encryption and secret handling;
- connector orchestration;
- the versioned HTTP API;
- background synchronization while the engine is running.

It starts as a normal Node.js process and exposes its API over HTTP. It has no command system beyond what is necessary to start the application.

The first storage implementation will be SQLite. The encryption design must be decided before real financial credentials or sensitive financial records are persisted.

The engine API will be described with Effect Schema and Effect HTTP API primitives so requests, responses, and expected failures are validated at runtime as well as typed at compile time.

The engine will expose a browser-safe API-contract entry point. The web application may import that entry point, but must not import engine runtime, storage, or Node-specific modules. If maintaining this boundary becomes difficult, the API contracts can later be extracted into their own package.

### `apps/web`

The web application is the only frontend.

Initial stack:

- React;
- Vite;
- TanStack Router;
- TanStack Query;
- StyleX for application-specific styling;
- Astryx for accessible components, design tokens, themes, and common interface patterns;
- the typed engine API client.

It is a client-rendered SPA. TanStack Start and SSR are not needed initially because all server-side behavior belongs to the engine.

The web application will use Astryx instead of building a design system from scratch. StyleX will provide custom layout and styling where Astryx components and tokens are not sufficient. The initial setup should follow Astryx's Vite and StyleX integration, including its reset, theme, and `xstyle` conventions. Do not add a competing styling system.

The web application owns any product-specific UI components built on top of Astryx. Components should only be extracted into a shared package if a second frontend eventually needs to reuse them.

The frontend must support two engine locations without changing its product behavior:

- a local embedded engine selected by the desktop application;
- an external engine URL configured by the user.

### `apps/desktop`

The desktop application is a thin Electron shell around the web application.

It owns:

- the Electron main and preload processes;
- starting, monitoring, and stopping the embedded engine process;
- choosing between the embedded engine and an external engine;
- loading the web application's development server or production build;
- desktop packaging, updates, and narrowly scoped OS integration.

It does not contain a second React application or duplicate frontend behavior.

The Electron renderer must remain sandboxed, with Node integration disabled and context isolation enabled. Any privileged desktop operation must pass through a small, validated preload boundary.

## `packages/connectors`

The connectors package contains:

- the common connector definition;
- connector configuration schemas;
- normalized connector output types;
- connector-specific expected errors;
- an explicit registry of built-in connectors;
- built-in connector implementations.

Initial shape:

```text
packages/connectors/
  src/
    connector.ts
    registry.ts
    manual/
    csv/
```

A connector is an Effect-powered typed definition, not an inherited base class. At minimum it declares:

- a stable identifier;
- display metadata;
- a runtime-validated configuration schema;
- a synchronization operation returning normalized accounts, balances, transactions, and positions;
- typed expected failures;
- the Effect services it requires, such as HTTP, filesystem, secrets, or an interactive browser.

The engine supplies connector dependencies and consumes connector output. Connectors must not access the engine database directly.

Initially, connectors are compiled into the package and registered explicitly. A community connector is added through a reviewed pull request. Dynamic discovery, downloading third-party code, process isolation, and a plugin marketplace are deferred until they are actually needed.

## Dependency Direction

```text
desktop ── launches ──> engine
desktop ─── loads ────> web build
web ───────── calls ──> engine HTTP API
web ───── imports ────> engine browser-safe API contract
engine ─── imports ───> connectors
connectors ───────────> Effect and connector-local dependencies only
```

The engine never imports the desktop or web applications. Connectors never import the engine application.

## Runtime Modes

### Embedded mode

1. Electron starts the bundled engine as a child process.
2. The engine listens on a local-only address using an available port.
3. Electron passes the connection information to the web frontend through the preload boundary.
4. Electron loads the same web build used in every other mode.
5. Electron stops the child process when the desktop application exits.

Local process authentication must still exist; listening on localhost alone is not considered authentication.

### External mode

1. The user starts the Node.js engine on a home server, NAS, or VPS.
2. The user configures the desktop or web frontend with its URL.
3. The frontend authenticates to the engine over HTTPS.
4. The engine and its host remain entirely under the user's control.

An external engine must be treated as part of the user's trust boundary because it needs access to decrypted data while calculating wealth or running unattended synchronization.

## Initial Implementation Order

1. Expand the pnpm workspace to include `apps/*` and `packages/*`, then configure TypeScript, Oxlint, and Oxfmt at the workspace root.
2. Create the standalone engine with Effect and a minimal health endpoint.
3. Define one browser-safe, schema-backed API operation and consume it from the web SPA.
4. Create the Electron shell and make it launch the local engine and load the web SPA.
5. Add the minimal connector definition and an in-memory or fixture connector to validate the boundary.
6. Add SQLite persistence and migrations.
7. Decide and implement the vault encryption and secret-storage design.
8. Add the first useful connector, likely manual entry or file import.

Each step should prove one architectural boundary before more abstractions are introduced.

## Decisions Deliberately Deferred

- Exact SQLite encryption approach
- Electron packaging and update tooling
- Remote-engine pairing and authentication protocol
- Connector sandboxing
- Browser automation implementation
- Docker distribution
- Encrypted backups and synchronization
- Mobile or separately hosted web clients

These decisions should be made when their corresponding feature enters scope, without changing the four-part initial structure unless necessary.
