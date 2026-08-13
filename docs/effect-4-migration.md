# Effect 4 migration inventory

Pinned family: `4.0.0-rc.108` for `effect`, `@effect/platform-node`, `@effect/sql-sqlite-node`, and `@effect/vitest`.

Migration guides used: Effect v3→v4 overview and Schema topic guide (2026-08-13).

| Area          | Optimus surface                                             | Class      | Replacement                                                |
| ------------- | ----------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| Core services | `Context.GenericTag`, `Layer.effect`, `Layer.scopedContext` | mechanical | `Context.Service` + `Layer.effect` / `Layer.effectContext` |
| Errors        | `catchAllDefect`, `Cause.failures` / `Cause.defects`        | semantic   | `catchDefect`, `Cause.pretty` / flattened `Cause`          |
| Scope/runtime | scoped SQLite, `Layer.launch`, `NodeRuntime.runMain`        | semantic   | v4 scope + `node:sqlite` driver; startup/shutdown tests    |
| Schema        | API, connector, SQL row, error schemas                      | semantic   | `Schema.Literals`, `httpApiStatus`, encode/decode tests    |
| HTTP/HttpApi  | `Api.ts`, handlers, web client, CORS, logging               | mechanical | supported `effect/unstable/http*` category exports         |
| SQL/SQLite    | client, tagged SQL, transactions, migrations, backup        | semantic   | `effect/unstable/sql` + `@effect/sql-sqlite-node`          |
| Reactivity    | SQLite client setup                                         | mechanical | `effect/unstable/reactivity` adapter                       |
| Testing       | plain Vitest + `Effect.runPromise`                          | mechanical | `@effect/vitest` `it.effect` / `it.layer`                  |

Unstable namespaces are imported directly from Effect's supported category exports. Optimus does not mirror them through local re-export facades.
