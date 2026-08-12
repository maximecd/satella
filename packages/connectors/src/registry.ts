import type { AnyConnector, Connector, ConnectorCredentialField } from "./connector.js";
import { OkxConnector } from "./okx/connector.js";

export interface ConnectorCapability {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly instructions?: string;
  readonly credentialFields: ReadonlyArray<ConnectorCredentialField>;
}

export type ConnectorRegistry = ReadonlyMap<string, AnyConnector>;

export const connectorCapabilities = (
  registry: ConnectorRegistry,
): ReadonlyArray<ConnectorCapability> =>
  [...registry.values()].map(({ id, name, icon, instructions, credentialFields }) => ({
    id,
    name,
    ...(icon === undefined ? {} : { icon }),
    ...(instructions === undefined ? {} : { instructions }),
    credentialFields,
  }));

export const connectorRegistryFrom = <Credentials, R>(
  connectors: ReadonlyArray<Connector<Credentials, R>>,
): ConnectorRegistry =>
  new Map(
    connectors.map((connector) => [connector.id, connector] as const),
  ) as unknown as ConnectorRegistry;

export const BuiltinConnectorRegistry: ConnectorRegistry = connectorRegistryFrom([OkxConnector]);

export const BUILTIN_CONNECTOR_CAPABILITIES = connectorCapabilities(BuiltinConnectorRegistry);
