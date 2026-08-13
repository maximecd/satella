import { connectorCapabilities, connectorRegistryFrom } from "@optimus/connector-core";
import { IbkrConnector } from "@optimus/connector-ibkr";
import { OkxConnector } from "@optimus/connector-okx";

/** The built-in connector selection is application composition, not connector-core policy. */
export const CONNECTOR_REGISTRY = connectorRegistryFrom([OkxConnector, IbkrConnector]);

/** Discovery is projected from the same ordered registry used for execution. */
export const CONNECTOR_CAPABILITIES = connectorCapabilities(CONNECTOR_REGISTRY);
