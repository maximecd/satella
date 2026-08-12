import type {
  AnyConnector,
  ConnectorAssetClass,
  ConnectorCredentialField,
} from "./connector.js";
import { OkxConnector } from "./okx/connector.js";
import { IbkrConnector } from "./ibkr/connector.js";

export interface ConnectorCapability {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly instructions?: string;
  readonly assetClasses: ReadonlyArray<ConnectorAssetClass>;
  readonly credentialFields: ReadonlyArray<ConnectorCredentialField>;
}

export type ConnectorRegistry = ReadonlyMap<string, AnyConnector>;

const requireAssetClasses = (connector: AnyConnector) => {
  if (connector.assetClasses.length === 0) {
    throw new Error(`Connector ${connector.id} must declare at least one supported asset class`);
  }
  return connector;
};

export const connectorCapabilities = (
  registry: ConnectorRegistry,
): ReadonlyArray<ConnectorCapability> =>
  [...registry.values()].map(
    ({ id, name, icon, instructions, assetClasses, credentialFields }) => ({
      id,
      name,
      ...(icon === undefined ? {} : { icon }),
      ...(instructions === undefined ? {} : { instructions }),
      assetClasses,
      credentialFields,
    }),
  );

export const connectorRegistryFrom = (connectors: ReadonlyArray<AnyConnector>): ConnectorRegistry =>
  new Map(
    connectors.map((connector) => [requireAssetClasses(connector).id, connector] as const),
  ) as unknown as ConnectorRegistry;

export const BuiltinConnectorRegistry: ConnectorRegistry = connectorRegistryFrom([
  OkxConnector,
  IbkrConnector,
]);

export const BUILTIN_CONNECTOR_CAPABILITIES = connectorCapabilities(BuiltinConnectorRegistry);
