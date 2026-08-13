import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { connectorCapabilities, connectorRegistryFrom, validateConnectorOutput } from "./index.js";

const connector = (id: string, name = id) => ({
  id,
  name,
  assetClasses: ["crypto" as const],
  credentialFields: [],
  credentialsSchema: Schema.Unknown,
  authenticate: () => Effect.die("unused"),
});

describe("connector registry", () => {
  it("preserves explicit order and projects capabilities from the same registry", () => {
    const registry = connectorRegistryFrom([connector("second"), connector("first")]);
    expect([...registry].map(([id]) => id)).toEqual(["second", "first"]);
    expect(connectorCapabilities(registry).map(({ id }) => id)).toEqual(["second", "first"]);
  });

  it("rejects duplicate IDs and incomplete public metadata", () => {
    expect(() => connectorRegistryFrom([connector("same"), connector("same")])).toThrow(
      "Duplicate connector ID: same",
    );
    expect(() => connectorRegistryFrom([connector("   ")])).toThrow("ID must not be empty");
    expect(() => connectorRegistryFrom([connector("empty-name", " ")])).toThrow(
      "must have a non-empty name",
    );
    expect(() =>
      connectorRegistryFrom([{ ...connector("empty-classes"), assetClasses: [] }]),
    ).toThrow("must declare at least one supported asset class");
  });

  it("validates provider output without importing a provider package", async () => {
    await expect(
      Effect.runPromise(
        validateConnectorOutput([
          {
            externalId: "account",
            name: "Account",
            baseCurrencyIso: "USD",
            accountKind: "crypto",
            positions: [],
          },
        ]),
      ),
    ).resolves.toHaveLength(1);
  });

  it("rejects duplicate accounts and invalid position quantities", async () => {
    const account = {
      externalId: "account",
      name: "Account",
      baseCurrencyIso: "USD",
      accountKind: "crypto" as const,
      positions: [],
    };
    await expect(Effect.runPromise(validateConnectorOutput([account, account]))).rejects.toThrow(
      "duplicate account ID",
    );
    await expect(
      Effect.runPromise(
        validateConnectorOutput([
          {
            ...account,
            positions: [
              {
                quantity: Number.NaN,
                asset: {
                  externalId: "asset",
                  assetClass: "crypto",
                  name: "Asset",
                  identifiers: [],
                },
              },
            ],
          },
        ]),
      ),
    ).rejects.toThrow("non-finite position quantity");
  });
});
