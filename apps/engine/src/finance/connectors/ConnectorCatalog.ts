import type {
  AnyConnector,
  ConnectorCapability,
  ConnectorRegistry,
} from "@satella-app/connector-core";
import { connectorCapabilities } from "@satella-app/connector-core";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { CONNECTOR_REGISTRY } from "./registry.js";

export class ConnectorCatalog extends Context.Service<
  ConnectorCatalog,
  {
    readonly capabilities: () => { readonly connectors: ReadonlyArray<ConnectorCapability> };
    readonly get: (id: string) => AnyConnector | undefined;
  }
>()("@satella-app/engine/finance/ConnectorCatalog") {}

export const make = (registry: ConnectorRegistry) =>
  ConnectorCatalog.of({
    capabilities: () => ({ connectors: connectorCapabilities(registry) }),
    get: (id) => registry.get(id),
  });

export const layer = Layer.succeed(ConnectorCatalog, make(CONNECTOR_REGISTRY));
