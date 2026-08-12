import { describe, expect, it } from "vitest";

import {
  BUILTIN_CONNECTOR_CAPABILITIES,
  BuiltinConnectorRegistry,
  connectorRegistryFrom,
} from "../src/index.js";

describe("connector registry", () => {
  it("advertises discovery asset classes for built-in connectors", () => {
    expect(BuiltinConnectorRegistry.get("ibkr")?.assetClasses).toEqual(["security"]);
    expect(BuiltinConnectorRegistry.get("okx")?.assetClasses).toEqual(["crypto"]);
    expect(
      BUILTIN_CONNECTOR_CAPABILITIES.map(({ id, assetClasses }) => ({ id, assetClasses })),
    ).toEqual([
      { id: "okx", assetClasses: ["crypto"] },
      { id: "ibkr", assetClasses: ["security"] },
    ]);
  });

  it("rejects connectors that declare no discovery asset classes", () => {
    expect(() =>
      connectorRegistryFrom([
        {
          id: "empty",
          name: "Empty",
          assetClasses: [],
          credentialFields: [],
          credentialsSchema: undefined as never,
          authenticate: () => {
            throw new Error("unused");
          },
        },
      ]),
    ).toThrow("must declare at least one supported asset class");
  });
});
