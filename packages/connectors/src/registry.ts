import type { AnyConnector, Connector } from "./connector.js";
import { OkxConnector } from "./okx/connector.js";

export interface ConnectorCapability {
  readonly id: string;
  readonly name: string;
}

export type ConnectorRegistry = ReadonlyMap<string, AnyConnector>;

export const connectorCapabilities = (
  registry: ConnectorRegistry,
): ReadonlyArray<ConnectorCapability> =>
  [...registry.values()].map(({ id, name }) => ({ id, name }));

export const connectorRegistryFrom = <Credentials, R>(
  connectors: ReadonlyArray<Connector<Credentials, R>>,
): ConnectorRegistry =>
  new Map(
    connectors.map((connector) => [connector.id, connector] as const),
  ) as unknown as ConnectorRegistry;

export const BuiltinConnectorRegistry: ConnectorRegistry = connectorRegistryFrom([OkxConnector]);

export const BUILTIN_CONNECTOR_CAPABILITIES = connectorCapabilities(BuiltinConnectorRegistry);
