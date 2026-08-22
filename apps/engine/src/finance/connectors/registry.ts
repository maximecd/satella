import { connectorCapabilities, connectorRegistryFrom } from "@satella-app/connector-core";
import { IbkrConnector } from "@satella-app/connector-ibkr";
import { KrakenConnector } from "@satella-app/connector-kraken";
import { OkxConnector } from "@satella-app/connector-okx";

/** The built-in connector selection is application composition, not connector-core policy. */
export const CONNECTOR_REGISTRY = connectorRegistryFrom([
  OkxConnector,
  KrakenConnector,
  IbkrConnector,
]);

/** Discovery is projected from the same ordered registry used for execution. */
export const CONNECTOR_CAPABILITIES = connectorCapabilities(CONNECTOR_REGISTRY);
