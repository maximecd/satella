import type { AnyConnector } from "@optimus/connectors";
import { BuiltinConnectorRegistry } from "@optimus/connectors";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { CONNECTOR_CAPABILITIES } from "../config.js";

export class ConnectorCatalog extends Context.Service<
  ConnectorCatalog,
  {
    readonly capabilities: () => { readonly connectors: typeof CONNECTOR_CAPABILITIES };
    readonly get: (id: string) => AnyConnector | undefined;
  }
>()("@optimus/engine/finance/ConnectorCatalog") {}

export const layer = Layer.succeed(
  ConnectorCatalog,
  ConnectorCatalog.of({
    capabilities: () => ({ connectors: CONNECTOR_CAPABILITIES }),
    get: (id) => BuiltinConnectorRegistry.get(id),
  }),
);
