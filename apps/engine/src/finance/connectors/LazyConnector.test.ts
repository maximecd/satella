import {
  connectorCapabilities,
  connectorRegistryFrom,
  type AnyConnector,
} from "@satella-app/connector-core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { makeLazyConnector } from "./LazyConnector.js";

describe("lazy Connector acquisition", () => {
  it("keeps metadata available and loads an execution adapter once on first use", async () => {
    let loads = 0;
    const capability = {
      id: "test",
      name: "Test",
      assetCategories: ["crypto" as const],
      credentialFields: [],
    };
    const connector = makeLazyConnector({
      capability,
      load: async () => {
        loads += 1;
        return {
          ...capability,
          credentialsSchema: Schema.Unknown,
          authenticate: () => Effect.succeed({ fetchAccounts: () => Effect.succeed([]) }),
        } satisfies AnyConnector;
      },
    });

    expect(connectorCapabilities(connectorRegistryFrom([connector]))).toEqual([capability]);
    expect(loads).toBe(0);
    await Effect.runPromise(connector.authenticate({}) as Effect.Effect<unknown, unknown, never>);
    await Effect.runPromise(connector.authenticate({}) as Effect.Effect<unknown, unknown, never>);
    expect(loads).toBe(1);
  });
});
