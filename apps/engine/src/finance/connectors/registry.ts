import { connectorCapabilities, connectorRegistryFrom } from "@satella-app/connector-core";
import { EvmConnectorCapability } from "@satella-app/connector-evm/metadata";
import { IbkrConnectorCapability } from "@satella-app/connector-ibkr/metadata";
import { KrakenConnectorCapability } from "@satella-app/connector-kraken/metadata";
import { OkxConnectorCapability } from "@satella-app/connector-okx/metadata";

import { makeLazyConnector } from "./LazyConnector.js";

/**
 * The built-in catalog is application composition, not connector-core policy.
 * Only capability metadata is imported at startup; adapter modules are loaded
 * by the proxy on the first authenticated use.
 */
export const CONNECTOR_REGISTRY = connectorRegistryFrom([
  makeLazyConnector({
    capability: EvmConnectorCapability,
    load: async () => (await import("@satella-app/connector-evm")).EvmConnector,
  }),
  makeLazyConnector({
    capability: OkxConnectorCapability,
    load: async () => (await import("@satella-app/connector-okx")).OkxConnector,
  }),
  makeLazyConnector({
    capability: KrakenConnectorCapability,
    load: async () => (await import("@satella-app/connector-kraken")).KrakenConnector,
  }),
  makeLazyConnector({
    capability: IbkrConnectorCapability,
    load: async () => (await import("@satella-app/connector-ibkr")).IbkrConnector,
  }),
]);

/** Discovery is projected from the same ordered registry used for execution. */
export const CONNECTOR_CAPABILITIES = connectorCapabilities(CONNECTOR_REGISTRY);
