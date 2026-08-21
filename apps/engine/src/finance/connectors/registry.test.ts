import { connectorRegistryFrom } from "@optimus/connector-core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { CONNECTOR_CAPABILITIES, CONNECTOR_REGISTRY } from "./registry.js";
import { make as makeCatalog } from "./ConnectorCatalog.js";

describe("connector composition", () => {
  it("preserves the public built-in order and derives discovery from execution", () => {
    expect(CONNECTOR_CAPABILITIES.map(({ id }) => id)).toEqual(["okx", "kraken", "ibkr"]);
    expect([...CONNECTOR_REGISTRY].map(([id]) => id)).toEqual(["okx", "kraken", "ibkr"]);
    expect(CONNECTOR_CAPABILITIES.every(({ id }) => CONNECTOR_REGISTRY.has(id))).toBe(true);
    const catalog = makeCatalog(CONNECTOR_REGISTRY);
    expect(catalog.capabilities().connectors).toEqual(CONNECTOR_CAPABILITIES);
    expect(catalog.get("okx")).toBe(CONNECTOR_REGISTRY.get("okx"));
  });

  it("accepts a custom connector without changing core or another provider", () => {
    const custom = {
      id: "custom",
      name: "Custom",
      assetCategories: ["cash" as const],
      credentialFields: [],
      credentialsSchema: Schema.Unknown,
      authenticate: () => Effect.die("unused"),
    };
    const registry = connectorRegistryFrom([custom]);
    expect(registry.get("custom")).toBe(custom);
    expect(registry.get("okx")).toBeUndefined();
  });
});
